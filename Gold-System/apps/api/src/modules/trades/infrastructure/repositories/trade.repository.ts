import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { TradeStatus } from '@gold/shared-types';
import { PrismaService } from '../../../../database/prisma.service';
import { TradeEntity } from '../../domain/entities/trade.entity';
import { TradeItemEntity } from '../../domain/entities/trade-item.entity';

type TradeRow = Prisma.TradeGetPayload<{ include: { items: true } }>;
type TradeItemRow = Prisma.TradeItemGetPayload<Record<string, never>>;

@Injectable()
export class TradeRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Reads ───────────────────────────────────────────────────

  async findById(id: string): Promise<TradeEntity | null> {
    const row = await this.prisma.trade.findUnique({
      where: { id },
      include: { items: true },
    });
    return row ? this.toDomain(row) : null;
  }

  /**
   * Customer-scoped lookup — enforces customer isolation (§7).
   * Returns null (not 403) to prevent enumeration attacks.
   */
  async findByIdForCustomer(id: string, customerId: string): Promise<TradeEntity | null> {
    const row = await this.prisma.trade.findFirst({
      where: { id, customerId },
      include: { items: true },
    });
    return row ? this.toDomain(row) : null;
  }

  /**
   * Get the Trade for a specific Order.
   * Returns null if no Trade exists yet.
   */
  async findByOrderId(orderId: string): Promise<TradeEntity | null> {
    const row = await this.prisma.trade.findUnique({
      where: { orderId },
      include: { items: true },
    });
    return row ? this.toDomain(row) : null;
  }

  /**
   * Staff: list all Trades with pagination.
   */
  async findAll(opts: {
    page: number;
    limit: number;
    status?: TradeStatus;
  }): Promise<{ trades: TradeEntity[]; total: number }> {
    const skip = (opts.page - 1) * opts.limit;
    const where = opts.status ? { status: opts.status } : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.trade.findMany({
        where,
        include: { items: true },
        orderBy: { confirmedAt: 'desc' },
        skip,
        take: opts.limit,
      }),
      this.prisma.trade.count({ where }),
    ]);

    return { trades: rows.map((r) => this.toDomain(r)), total };
  }

  /**
   * Customer-scoped: list own Trades.
   */
  async findByCustomerId(
    customerId: string,
    opts: { page: number; limit: number },
  ): Promise<{ trades: TradeEntity[]; total: number }> {
    const skip = (opts.page - 1) * opts.limit;
    const where = { customerId };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.trade.findMany({
        where,
        include: { items: true },
        orderBy: { confirmedAt: 'desc' },
        skip,
        take: opts.limit,
      }),
      this.prisma.trade.count({ where }),
    ]);

    return { trades: rows.map((r) => this.toDomain(r)), total };
  }

  // ─── Sequence ────────────────────────────────────────────────

  /**
   * Generates the next sequential trade number within a transaction.
   * Format: TRD-000001, TRD-000002, …
   * Must be called inside a Prisma transaction.
   */
  async nextTradeNumber(tx: Prisma.TransactionClient): Promise<string> {
    const count = await tx.trade.count();
    const seq = count + 1;
    return `TRD-${String(seq).padStart(6, '0')}`;
  }

  // ─── Writes ──────────────────────────────────────────────────

  /**
   * Creates a Trade record within an existing transaction.
   *
   * IMMUTABILITY (BR-T02): All financial fields passed here are set once and
   * never updated. Corrections require the REVERSED mechanism (§4.2).
   *
   * IDEMPOTENCY: The unique constraint on orderId prevents duplicate Trades.
   * Concurrent confirmation attempts will fail here on the second call.
   */
  async createInTx(
    tx: Prisma.TransactionClient,
    data: {
      tradeNumber: string;
      orderId: string;
      quotationId: string;
      customerId: string;
      pricingCalculationId: string;
      status: TradeStatus;
      totalAmountRial: Decimal;
      weightGrams: Decimal;
      purityRatio: Decimal;
      unitPriceRial: Decimal;
      step1BasePrice: Decimal | null;
      wageAmount: Decimal | null;
      profitAmount: Decimal | null;
      taxAmount: Decimal | null;
      discountAmount: Decimal | null;
      roundingAmount: Decimal | null;
      isComplete: boolean;
      customerType: string | null;
      lockedTermsSnapshot: Record<string, unknown>;
      confirmedByUserId: string;
      confirmedAt: Date;
      items: Array<{
        weightGrams: Decimal;
        purityRatio: Decimal;
        unitPriceRial: Decimal;
        totalPriceRial: Decimal;
        description: string | null;
      }>;
    },
  ): Promise<TradeEntity> {
    const row = (await tx.trade.create({
      data: {
        tradeNumber: data.tradeNumber,
        orderId: data.orderId,
        quotationId: data.quotationId,
        customerId: data.customerId,
        pricingCalculationId: data.pricingCalculationId,
        status: data.status,
        totalAmountRial: data.totalAmountRial,
        weightGrams: data.weightGrams,
        purityRatio: data.purityRatio,
        unitPriceRial: data.unitPriceRial,
        step1BasePrice: data.step1BasePrice ?? undefined,
        wageAmount: data.wageAmount ?? undefined,
        profitAmount: data.profitAmount ?? undefined,
        taxAmount: data.taxAmount ?? undefined,
        discountAmount: data.discountAmount ?? undefined,
        roundingAmount: data.roundingAmount ?? undefined,
        isComplete: data.isComplete,
        customerType: data.customerType ?? undefined,
        lockedTermsSnapshot: data.lockedTermsSnapshot as Prisma.InputJsonValue,
        confirmedByUserId: data.confirmedByUserId,
        confirmedAt: data.confirmedAt,
        items: {
          create: data.items.map((item) => ({
            weightGrams: item.weightGrams,
            purityRatio: item.purityRatio,
            unitPriceRial: item.unitPriceRial,
            totalPriceRial: item.totalPriceRial,
            description: item.description ?? undefined,
          })),
        },
      },
      include: { items: true },
    })) as unknown as TradeRow;

    return this.toDomain(row);
  }

  // ─── Mappers ─────────────────────────────────────────────────

  private toDomain(row: TradeRow): TradeEntity {
    return new TradeEntity({
      id: row.id,
      tradeNumber: row.tradeNumber,
      orderId: row.orderId,
      quotationId: row.quotationId,
      customerId: row.customerId,
      pricingCalculationId: row.pricingCalculationId,
      status: row.status as TradeStatus,
      totalAmountRial: new Decimal(row.totalAmountRial.toString()),
      weightGrams: new Decimal(row.weightGrams.toString()),
      purityRatio: new Decimal(row.purityRatio.toString()),
      unitPriceRial: new Decimal(row.unitPriceRial.toString()),
      step1BasePrice: row.step1BasePrice ? new Decimal(row.step1BasePrice.toString()) : null,
      wageAmount: row.wageAmount ? new Decimal(row.wageAmount.toString()) : null,
      profitAmount: row.profitAmount ? new Decimal(row.profitAmount.toString()) : null,
      taxAmount: row.taxAmount ? new Decimal(row.taxAmount.toString()) : null,
      discountAmount: row.discountAmount ? new Decimal(row.discountAmount.toString()) : null,
      roundingAmount: row.roundingAmount ? new Decimal(row.roundingAmount.toString()) : null,
      isComplete: row.isComplete,
      customerType: row.customerType,
      lockedTermsSnapshot: row.lockedTermsSnapshot as Record<string, unknown>,
      confirmedByUserId: row.confirmedByUserId,
      confirmedAt: row.confirmedAt,
      reversedByUserId: row.reversedByUserId,
      reversedAt: row.reversedAt,
      reversalReason: row.reversalReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      items: row.items.map((item) => this.toItemDomain(item)),
    });
  }

  private toItemDomain(row: TradeItemRow): TradeItemEntity {
    return new TradeItemEntity({
      id: row.id,
      tradeId: row.tradeId,
      weightGrams: new Decimal(row.weightGrams.toString()),
      purityRatio: new Decimal(row.purityRatio.toString()),
      unitPriceRial: new Decimal(row.unitPriceRial.toString()),
      totalPriceRial: new Decimal(row.totalPriceRial.toString()),
      description: row.description,
      createdAt: row.createdAt,
    });
  }
}
