import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import { PrismaService } from '../../../../database/prisma.service';
import { PaymentEntity, PaymentAllocationEntity } from '../../domain/entities/payment.entity';
import { PaymentMethod, PaymentStatus } from '../../domain/constants/payment-methods';
import { readPaymentSide } from '../../application/payment-ledger';

/**
 * Payment Repository
 *
 * All write operations (create) are performed inside a Prisma transaction
 * provided by the caller, ensuring atomicity with related operations.
 *
 * Read operations use PrismaService directly.
 *
 * CONCURRENCY: createAllocationInTx uses SELECT ... FOR UPDATE on the Trade row
 * to serialize concurrent allocation attempts, preventing over-allocation.
 * §13 (Concurrency protection): "system must NOT allow total allocation to exceed Trade total."
 */

export interface LedgerPaymentRecord {
  payment: PaymentEntity;
  orderId: string | null;
  orderNumber: string | null;
  tradeNumber: string | null;
  relatedSide: 'BUY' | 'SELL' | null;
}

const ledgerInclude = {
  trade: {
    select: {
      tradeNumber: true,
      orderId: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          items: {
            select: { metadata: true },
            orderBy: { createdAt: 'asc' as const },
            take: 1,
          },
        },
      },
    },
  },
} satisfies Prisma.PaymentInclude;

type LedgerRow = Prisma.PaymentGetPayload<{ include: typeof ledgerInclude }>;

@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Read Operations ─────────────────────────────────────────────────────────

  async findById(id: string): Promise<PaymentEntity | null> {
    const row = await this.prisma.payment.findUnique({ where: { id } });
    return row ? this.mapRow(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<PaymentEntity | null> {
    const row = await this.prisma.payment.findUnique({ where: { idempotencyKey: key } });
    return row ? this.mapRow(row) : null;
  }

  async findByTradeId(tradeId: string): Promise<PaymentEntity[]> {
    const rows = await this.prisma.payment.findMany({
      where: { tradeId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.mapRow(r));
  }

  async count(where: Prisma.PaymentWhereInput): Promise<number> {
    return this.prisma.payment.count({ where });
  }

  async queryLedger(
    where: Prisma.PaymentWhereInput,
    page: number,
    limit: number,
  ): Promise<{ total: number; rows: LedgerPaymentRecord[] }> {
    const [total, rows] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: ledgerInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { total, rows: rows.map((row) => this.mapLedgerRow(row)) };
  }

  async summarizeLedger(
    where: Prisma.PaymentWhereInput,
  ): Promise<Array<{ status: string; count: number; amount: string | null }>> {
    const groups = await this.prisma.payment.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: { amount: true },
    });
    return groups.map((group) => ({
      status: group.status,
      count: group._count._all,
      amount: group._sum.amount == null ? null : group._sum.amount.toString(),
    }));
  }

  async findOwned(id: string, customerId: string): Promise<LedgerPaymentRecord | null> {
    const row = await this.prisma.payment.findFirst({
      where: { id, customerId },
      include: ledgerInclude,
    });
    return row ? this.mapLedgerRow(row) : null;
  }

  async findAll(opts: {
    limit?: number;
    offset?: number;
    tradeId?: string;
    customerId?: string;
    status?: PaymentStatus;
  }): Promise<PaymentEntity[]> {
    const rows = await this.prisma.payment.findMany({
      where: {
        ...(opts.tradeId ? { tradeId: opts.tradeId } : {}),
        ...(opts.customerId ? { customerId: opts.customerId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 50,
      skip: opts.offset ?? 0,
    });
    return rows.map((r) => this.mapRow(r));
  }

  async findAllocationsByTradeId(tradeId: string): Promise<PaymentAllocationEntity[]> {
    const rows = await this.prisma.paymentAllocation.findMany({
      where: { tradeId },
      orderBy: { allocatedAt: 'asc' },
    });
    return rows.map((r) => this.mapAllocationRow(r));
  }

  async findAllocationByPaymentAndTrade(
    paymentId: string,
    tradeId: string,
  ): Promise<PaymentAllocationEntity | null> {
    const row = await this.prisma.paymentAllocation.findUnique({
      where: { paymentId_tradeId: { paymentId, tradeId } },
    });
    return row ? this.mapAllocationRow(row) : null;
  }

  /**
   * Computes total allocated amount for a Trade using Decimal arithmetic.
   * Uses aggregate SUM from the database for precision.
   */
  async getTotalAllocatedForTrade(tradeId: string): Promise<Decimal> {
    const result = await this.prisma.paymentAllocation.aggregate({
      where: { tradeId },
      _sum: { amount: true },
    });
    return new Decimal((result._sum.amount ?? 0).toString());
  }

  // ─── Write Operations (must be called inside a tx) ───────────────────────────

  /**
   * Creates a Payment record inside a Prisma transaction.
   * The caller controls the transaction boundary (atomicity).
   */
  async createPaymentInTx(
    tx: Prisma.TransactionClient,
    input: {
      idempotencyKey: string;
      tradeId: string;
      customerId: string;
      method: PaymentMethod;
      amount: Decimal;
      currency: string;
      referenceNumber: string | null;
      receiptKey?: string | null;
      receiptMimeType?: string | null;
      receiptFileName?: string | null;
      notes: string | null;
      receivedAt: Date | null;
      recordedByUserId: string | null;
    },
  ): Promise<PaymentEntity> {
    const row = await tx.payment.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        tradeId: input.tradeId,
        customerId: input.customerId,
        method: input.method,
        amount: input.amount.toFixed(2),
        currency: input.currency,
        referenceNumber: input.referenceNumber,
        receiptKey: input.receiptKey ?? null,
        receiptMimeType: input.receiptMimeType ?? null,
        receiptFileName: input.receiptFileName ?? null,
        notes: input.notes,
        receivedAt: input.receivedAt,
        recordedByUserId: input.recordedByUserId,
        status: 'PENDING',
      },
    });
    return this.mapRow(row);
  }

  /**
   * Updates payment status (used for VALIDATED, ALLOCATED, COMPLETED, FAILED, REVERSED).
   * Performed inside a transaction provided by caller.
   */
  async updateStatusInTx(
    tx: Prisma.TransactionClient,
    paymentId: string,
    status: PaymentStatus,
    extra?: { validatedAt?: Date; validatedByUserId?: string },
  ): Promise<PaymentEntity> {
    const row = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status,
        ...(extra?.validatedAt ? { validatedAt: extra.validatedAt } : {}),
        ...(extra?.validatedByUserId ? { validatedByUserId: extra.validatedByUserId } : {}),
      },
    });
    return this.mapRow(row);
  }

  /**
   * Creates a PaymentAllocation inside a Prisma transaction.
   *
   * CONCURRENCY PROTECTION:
   * Before creating the allocation, acquires a row-level lock on the Trade row
   * using SELECT ... FOR UPDATE. This serializes concurrent allocation attempts
   * and ensures the total allocation check is race-free.
   *
   * §13 user requirement: "system must NOT allow total allocation to exceed Trade total."
   */
  async createAllocationInTx(
    tx: Prisma.TransactionClient,
    input: {
      paymentId: string;
      tradeId: string;
      amount: Decimal;
      allocatedByUserId: string | null;
    },
  ): Promise<PaymentAllocationEntity> {
    // Lock the Trade row to serialize concurrent allocation attempts
    await tx.$executeRaw`SELECT id FROM trades WHERE id = ${input.tradeId} FOR UPDATE`;

    const row = await tx.paymentAllocation.create({
      data: {
        paymentId: input.paymentId,
        tradeId: input.tradeId,
        amount: input.amount.toFixed(2),
        allocatedByUserId: input.allocatedByUserId,
      },
    });
    return this.mapAllocationRow(row);
  }

  /**
   * Computes total allocated amount for a Trade inside a transaction.
   * Must be called AFTER acquiring a row lock on the Trade (via createAllocationInTx).
   */
  async getTotalAllocatedForTradeInTx(
    tx: Prisma.TransactionClient,
    tradeId: string,
  ): Promise<Decimal> {
    const result = await tx.paymentAllocation.aggregate({
      where: { tradeId },
      _sum: { amount: true },
    });
    return new Decimal((result._sum.amount ?? 0).toString());
  }

  // ─── Mapping Helpers ─────────────────────────────────────────────────────────

  /**
   * Public mapper used by PaymentService for the idempotency race-check path.
   * Called when a duplicate is detected inside a transaction.
   */
  mapRaceRow(row: {
    id: string;
    idempotencyKey: string;
    tradeId: string;
    customerId: string;
    method: string;
    amount: Decimal | string | number | { toString(): string };
    currency: string;
    status: string;
    referenceNumber: string | null;
    notes: string | null;
    receivedAt: Date | null;
    recordedByUserId: string | null;
    validatedAt: Date | null;
    validatedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PaymentEntity {
    return this.mapRow(row);
  }

  private mapLedgerRow(row: LedgerRow): LedgerPaymentRecord {
    const item = row.trade?.order?.items[0];
    return {
      payment: this.mapRow(row),
      orderId: row.trade?.order?.id ?? row.trade?.orderId ?? null,
      orderNumber: row.trade?.order?.orderNumber ?? null,
      tradeNumber: row.trade?.tradeNumber ?? null,
      relatedSide: readPaymentSide(item?.metadata),
    };
  }

  private mapRow(row: {
    id: string;
    idempotencyKey: string;
    tradeId: string;
    customerId: string;
    method: string;
    amount: Decimal | string | number | { toString(): string };
    currency: string;
    status: string;
    referenceNumber: string | null;
    receiptKey?: string | null;
    receiptMimeType?: string | null;
    receiptFileName?: string | null;
    notes: string | null;
    receivedAt: Date | null;
    recordedByUserId: string | null;
    validatedAt: Date | null;
    validatedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PaymentEntity {
    return new PaymentEntity({
      id: row.id,
      idempotencyKey: row.idempotencyKey,
      tradeId: row.tradeId,
      customerId: row.customerId,
      method: row.method as PaymentMethod,
      amount: new Decimal(row.amount.toString()),
      currency: row.currency,
      status: row.status as PaymentStatus,
      referenceNumber: row.referenceNumber,
      receiptKey: row.receiptKey ?? null,
      receiptMimeType: row.receiptMimeType ?? null,
      receiptFileName: row.receiptFileName ?? null,
      notes: row.notes,
      receivedAt: row.receivedAt,
      recordedByUserId: row.recordedByUserId,
      validatedAt: row.validatedAt,
      validatedByUserId: row.validatedByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private mapAllocationRow(row: {
    id: string;
    paymentId: string;
    tradeId: string;
    amount: Decimal | string | number | { toString(): string };
    allocatedByUserId: string | null;
    allocatedAt: Date;
  }): PaymentAllocationEntity {
    return new PaymentAllocationEntity({
      id: row.id,
      paymentId: row.paymentId,
      tradeId: row.tradeId,
      amount: new Decimal(row.amount.toString()),
      allocatedByUserId: row.allocatedByUserId,
      allocatedAt: row.allocatedAt,
    });
  }
}
