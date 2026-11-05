import { BadRequestException, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ORDER_STATUS_QUERY_VALUES } from '@gold/shared-types';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { OrderNotFoundException } from '../domain/exceptions/order.exceptions';
import {
  computeCustomerActivity,
  computeCustomerHolding,
  EMPTY_CUSTOMER_HOLDING,
  activityBucketKey,
  readOrderSide,
  type ActivityBucket,
  type ActivityComputation,
  type ActivityOrderInput,
  type ActivityQuery,
  type ActivityTransaction,
  type OrderSide,
  type PortfolioGoldHistoryPoint,
} from './customer-activity.math';

export class CustomerActivityQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsIn(['BUY', 'SELL'])
  side?: OrderSide;

  @IsOptional()
  @IsIn([...ORDER_STATUS_QUERY_VALUES])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  purityRatio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([10, 20, 50])
  limit?: number = 10;

  @IsOptional()
  @IsIn(['day', 'week', 'month', 'quarter', 'year'])
  bucket?: ActivityBucket = 'month';
}

const orderActivitySelect = {
  id: true,
  orderNumber: true,
  status: true,
  totalAmountRial: true,
  weightGrams: true,
  purityRatio: true,
  reservedAmountRial: true,
  createdAt: true,
  submittedAt: true,
  items: {
    select: { unitPriceRial: true, metadata: true },
    orderBy: { createdAt: 'asc' as const },
    take: 1,
  },
  trade: {
    select: {
      id: true,
      tradeNumber: true,
      status: true,
      totalAmountRial: true,
      weightGrams: true,
      unitPriceRial: true,
      wageAmount: true,
      taxAmount: true,
      confirmedAt: true,
      quotationId: true,
      payments: { select: { method: true } },
      settlement: { select: { status: true } },
    },
  },
  quotations: {
    orderBy: { version: 'desc' as const },
    take: 1,
    select: { id: true, quotationNumber: true },
  },
} satisfies Prisma.OrderSelect;

type ActivityRow = Prisma.OrderGetPayload<{ select: typeof orderActivitySelect }>;

function decimalText(value: { toString(): string } | null | undefined): string | null {
  if (value == null) return null;
  return value.toString();
}

function mapRow(row: ActivityRow): ActivityOrderInput {
  const item = row.items[0];
  const quotation = row.quotations[0];
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    totalAmountRial: row.totalAmountRial.toString(),
    weightGrams: row.weightGrams.toString(),
    purityRatio: row.purityRatio.toString(),
    unitPriceRial: decimalText(item?.unitPriceRial),
    side: readOrderSide(item?.metadata),
    createdAt: row.createdAt,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    reservedAmountRial: row.reservedAmountRial.toString(),
    trade: row.trade
      ? {
          id: row.trade.id,
          tradeNumber: row.trade.tradeNumber,
          status: row.trade.status,
          totalAmountRial: row.trade.totalAmountRial.toString(),
          weightGrams: row.trade.weightGrams.toString(),
          unitPriceRial: row.trade.unitPriceRial.toString(),
          wageAmount: decimalText(row.trade.wageAmount),
          taxAmount: decimalText(row.trade.taxAmount),
          confirmedAt: row.trade.confirmedAt?.toISOString() ?? null,
          quotationId: row.trade.quotationId,
        }
      : null,
    quotationId: quotation?.id ?? row.trade?.quotationId ?? null,
    quotationNumber: quotation?.quotationNumber ?? null,
    paymentMethods: Array.from(new Set(row.trade?.payments.map((payment) => payment.method) ?? [])),
    settlementStatus: row.trade?.settlement?.status ?? null,
  };
}

/**
 * Read model for the signed-in customer's معاملات page.
 * The customer id always comes from the authenticated user, never from the query.
 */
@Injectable()
export class CustomerActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async portfolio(userId: string) {
    const customerId = await this.resolveCustomerId(userId);
    if (!customerId) return EMPTY_CUSTOMER_HOLDING;
    const [rows, pickupTotals] = await Promise.all([
      this.prisma.order.findMany({
        where: { customerId },
        select: orderActivitySelect,
      }),
      this.pickupWeightTotals(customerId, this.prisma),
    ]);
    return computeCustomerHolding(rows.map(mapRow), pickupTotals);
  }

  /** Historical movements for the same confirmed-gold and wallet balance used by the portfolio read model. */
  async portfolioHistory(userId: string, dto: CustomerActivityQueryDto): Promise<PortfolioGoldHistoryPoint[]> {
    const range = this.parseRange(dto.from, dto.to);
    const customerId = await this.resolveCustomerId(userId);
    if (!customerId) return [];

    const [trades, pickups, creditTransactions] = await Promise.all([
      this.prisma.trade.findMany({
        where: {
          customerId,
          OR: [
            { confirmedAt: { gte: range.from, lte: range.to } },
            { reversedAt: { gte: range.from, lte: range.to } },
          ],
        },
        select: {
          status: true,
          weightGrams: true,
          confirmedAt: true,
          reversedAt: true,
          order: {
            select: {
              items: {
                orderBy: { createdAt: 'asc' },
                take: 1,
                select: { metadata: true },
              },
            },
          },
        },
      }),
      this.prisma.physicalGoldPickup.findMany({
        where: { customerId, status: 'DELIVERED', deliveredAt: { gte: range.from, lte: range.to } },
        select: { weightGrams: true, deliveredAt: true },
      }),
      this.creditHistoryForCustomer(customerId),
    ]);

    const grouped = new Map<string, {
      buy: Decimal; sell: Decimal; delivered: Decimal; available: Decimal; pendingPurchase: Decimal;
    }>();
    const add = (date: Date | null, field: 'buy' | 'sell' | 'delivered' | 'available' | 'pendingPurchase', amount: Decimal) => {
      if (!date || date < range.from || date > range.to || amount.isZero()) return;
      const key = activityBucketKey(date, dto.bucket ?? 'month');
      const point = grouped.get(key) ?? {
        buy: new Decimal(0), sell: new Decimal(0), delivered: new Decimal(0),
        available: new Decimal(0), pendingPurchase: new Decimal(0),
      };
      point[field] = point[field].plus(amount);
      grouped.set(key, point);
    };

    const finalized = new Set(['CONFIRMED', 'SETTLING', 'COMPLETED', 'REVERSED']);
    for (const trade of trades) {
      if (!finalized.has(trade.status)) continue;
      const side = readOrderSide(trade.order.items[0]?.metadata);
      if (!side) continue;
      const amount = new Decimal(trade.weightGrams.toString());
      add(trade.confirmedAt, side === 'BUY' ? 'buy' : 'sell', amount);
      if (trade.status === 'REVERSED' && trade.reversedAt) {
        add(trade.reversedAt, side === 'BUY' ? 'sell' : 'buy', amount);
      }
    }
    for (const pickup of pickups) add(pickup.deliveredAt, 'delivered', new Decimal(pickup.weightGrams.toString()));

    let previousAvailable = new Decimal(0);
    for (const transaction of creditTransactions) {
      const balance = new Decimal(transaction.balanceAfter.toString());
      let change = balance.minus(previousAvailable);
      if (transaction.type === 'GRANT' && transaction.sourceType !== 'MANUAL') {
        change = new Decimal(0);
      }
      previousAvailable = balance;
      add(transaction.createdAt, 'available', change);
      if (transaction.purchaseSide !== 'BUY') continue;
      const quantity = new Decimal(transaction.amount.toString());
      if (transaction.type === 'RESERVATION' && transaction.sourceType === 'ORDER') {
        add(transaction.createdAt, 'pendingPurchase', quantity);
      } else if (transaction.type === 'RELEASE' && transaction.sourceType === 'ORDER') {
        add(transaction.createdAt, 'pendingPurchase', quantity.negated());
      } else if (transaction.type === 'CONSUME' && transaction.sourceType === 'TRADE') {
        add(transaction.createdAt, 'pendingPurchase', quantity.negated());
      }
    }

    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, point]) => ({
      key,
      buyGrams: point.buy.toFixed(6),
      sellGrams: point.sell.toFixed(6),
      deliveredPickupGrams: point.delivered.toFixed(6),
      availableRialChange: point.available.toFixed(2),
      pendingPurchaseRialChange: point.pendingPurchase.toFixed(2),
    }));
  }

  private async creditHistoryForCustomer(customerId: string) {
    const account = await this.prisma.customerAccount.findUnique({
      where: { customerId }, select: { id: true },
    });
    if (!account) return [];
    const transactions = await this.prisma.creditTransaction.findMany({
      where: { accountId: account.id, creditPool: 'RIAL' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { type: true, amount: true, balanceAfter: true, sourceType: true, sourceId: true, createdAt: true },
    });
    const orderIds = [...new Set(transactions.filter((tx) => tx.sourceType === 'ORDER').map((tx) => tx.sourceId).filter((id): id is string => id != null))];
    const tradeIds = [...new Set(transactions.filter((tx) => tx.sourceType === 'TRADE').map((tx) => tx.sourceId).filter((id): id is string => id != null))];
    const [orders, trades] = await Promise.all([
      orderIds.length ? this.prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, items: { orderBy: { createdAt: 'asc' }, take: 1, select: { metadata: true } } },
      }) : Promise.resolve([]),
      tradeIds.length ? this.prisma.trade.findMany({
        where: { id: { in: tradeIds } },
        select: { id: true, order: { select: { items: { orderBy: { createdAt: 'asc' }, take: 1, select: { metadata: true } } } } },
      }) : Promise.resolve([]),
    ]);
    const orderSides = new Map(orders.map((order) => [order.id, readOrderSide(order.items[0]?.metadata)]));
    const tradeSides = new Map(trades.map((trade) => [trade.id, readOrderSide(trade.order.items[0]?.metadata)]));
    return transactions.map((tx) => ({
      ...tx,
      purchaseSide: tx.sourceType === 'ORDER'
        ? orderSides.get(tx.sourceId ?? '')
        : tx.sourceType === 'TRADE' ? tradeSides.get(tx.sourceId ?? '') : null,
    }));
  }

  /**
   * Booked buy−sell minus non-cancelled physical pickups.
   * Must run inside the same transaction that locks the customer account,
   * so a second sell or pickup sees the first as already committed.
   */
  async sellableWeightGrams(
    customerId: string,
    db: Prisma.TransactionClient,
  ): Promise<Decimal> {
    const [rows, pickupTotals] = await Promise.all([
      db.order.findMany({
        where: { customerId },
        select: orderActivitySelect,
      }),
      this.pickupWeightTotals(customerId, db),
    ]);
    return new Decimal(computeCustomerHolding(rows.map(mapRow), pickupTotals).weightGrams);
  }

  /**
   * Sums pickup weight that reduces sellable holding.
   * reserved = open pipeline; committed = reserved + delivered (everything except CANCELLED).
   */
  async pickupWeightTotals(
    customerId: string,
    db: Prisma.TransactionClient | PrismaService,
  ): Promise<{ pickupReservedGrams: Decimal; pickupCommittedGrams: Decimal }> {
    const rows = await db.physicalGoldPickup.findMany({
      where: { customerId, status: { not: 'CANCELLED' } },
      select: { weightGrams: true, status: true },
    });
    let reserved = new Decimal(0);
    let committed = new Decimal(0);
    for (const row of rows) {
      const grams = new Decimal(row.weightGrams.toString());
      committed = committed.plus(grams);
      if (row.status !== 'DELIVERED') {
        reserved = reserved.plus(grams);
      }
    }
    return { pickupReservedGrams: reserved, pickupCommittedGrams: committed };
  }

  async summary(userId: string, dto: CustomerActivityQueryDto) {
    const computed = await this.compute(userId, dto);
    const customerId = await this.resolveCustomerId(userId);
    const hasAny = customerId
      ? (await this.prisma.order.count({
          where: { customerId, status: { not: 'DRAFT' } },
        })) > 0
      : false;
    return {
      pnl: computed.pnl,
      volume: computed.volume,
      buy: computed.buy,
      sell: computed.sell,
      unclassified: computed.unclassified,
      distribution: computed.distribution,
      series: computed.series,
      purities: computed.purities,
      excludedCount: computed.excludedCount,
      totalsBasis: computed.totalsBasis,
      meta: computed.meta,
      hasAny,
    };
  }

  async list(userId: string, dto: CustomerActivityQueryDto) {
    const computed = await this.compute(userId, dto);
    return { data: computed.transactions, meta: computed.meta };
  }

  async detail(userId: string, orderId: string, isStaff: boolean): Promise<ActivityTransaction> {
    const customerId = isStaff ? null : await this.resolveCustomerId(userId);
    if (!isStaff && !customerId) throw new OrderNotFoundException(orderId);

    const row = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        ...(customerId ? { customerId } : {}),
      },
      select: orderActivitySelect,
    });
    if (!row) throw new OrderNotFoundException(orderId);

    const input = mapRow(row);
    const computed = computeCustomerActivity([input], {
      bucket: 'month',
      page: 1,
      limit: 1,
      status: input.status,
    });
    const transaction = computed.transactions[0];
    if (!transaction) throw new OrderNotFoundException(orderId);
    return transaction;
  }

  private async compute(
    userId: string,
    dto: CustomerActivityQueryDto,
  ): Promise<ActivityComputation> {
    const range = this.parseRange(dto.from, dto.to);
    const query = this.toQuery(dto);
    const customerId = await this.resolveCustomerId(userId);
    if (!customerId) return computeCustomerActivity([], query);

    const rows = await this.prisma.order.findMany({
      where: {
        customerId,
        createdAt: { gte: range.from, lte: range.to },
      },
      orderBy: { createdAt: 'desc' },
      select: orderActivitySelect,
    });
    return computeCustomerActivity(rows.map(mapRow), query);
  }

  private async resolveCustomerId(userId: string): Promise<string | null> {
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });
    return customer?.id ?? null;
  }

  private parseRange(from: string, to: string): { from: Date; to: Date } {
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new BadRequestException('بازه زمانی نامعتبر است');
    }
    const maxSpan = 366 * 5 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > maxSpan) {
      throw new BadRequestException('بازه زمانی نامعتبر است');
    }
    return { from: start, to: end };
  }

  private toQuery(dto: CustomerActivityQueryDto): ActivityQuery {
    return {
      side: dto.side,
      status: dto.status,
      purityRatio: dto.purityRatio,
      q: dto.q,
      bucket: dto.bucket ?? 'month',
      page: dto.page ?? 1,
      limit: dto.limit ?? 10,
    };
  }
}
