import { BadRequestException, Injectable } from '@nestjs/common';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '@gold/shared-types';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { OrderNotFoundException } from '../domain/exceptions/order.exceptions';
import {
  computeCustomerActivity,
  readOrderSide,
  type ActivityBucket,
  type ActivityComputation,
  type ActivityOrderInput,
  type ActivityQuery,
  type ActivityTransaction,
  type OrderSide,
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
  @IsIn(Object.values(OrderStatus))
  status?: OrderStatus;

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
  @IsIn(['week', 'month', 'quarter', 'year'])
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
