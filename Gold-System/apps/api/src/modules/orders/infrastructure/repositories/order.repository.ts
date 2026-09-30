import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { OrderStatus, CustomerType } from '@gold/shared-types';
import { PrismaService } from '../../../../database/prisma.service';
import { OrderEntity } from '../../domain/entities/order.entity';
import { OrderItemEntity } from '../../domain/entities/order-item.entity';

type OrderRow = Prisma.OrderGetPayload<{ include: { items: true } }>;
type ItemRow = Prisma.OrderItemGetPayload<Record<string, never>>;

@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Reads ───────────────────────────────────────────────────

  async findById(id: string): Promise<OrderEntity | null> {
    const row = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    return row ? this.toDomain(row) : null;
  }

  async findByIdForCustomer(id: string, customerId: string): Promise<OrderEntity | null> {
    const row = await this.prisma.order.findFirst({
      where: { id, customerId },
      include: { items: true },
    });
    return row ? this.toDomain(row) : null;
  }

  async findByCustomerId(
    customerId: string,
    opts: { page: number; limit: number },
  ): Promise<{ orders: OrderEntity[]; total: number }> {
    const skip = (opts.page - 1) * opts.limit;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: { customerId },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: opts.limit,
      }),
      this.prisma.order.count({ where: { customerId } }),
    ]);

    return { orders: rows.map((r) => this.toDomain(r)), total };
  }

  async findAll(opts: {
    page: number;
    limit: number;
    status?: OrderStatus;
    customerId?: string;
  }): Promise<{ orders: OrderEntity[]; total: number }> {
    const skip = (opts.page - 1) * opts.limit;
    const where: Prisma.OrderWhereInput = {};
    if (opts.status) where.status = opts.status;
    if (opts.customerId) where.customerId = opts.customerId;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: opts.limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { orders: rows.map((r) => this.toDomain(r)), total };
  }

  // ─── Next order number ────────────────────────────────────────

  /**
   * Generates the next sequential order number within a transaction.
   * Format: ORD-000001, ORD-000002, …
   * Must be called inside a Prisma transaction to be safe.
   */
  async nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const count = await tx.order.count();
    const seq = count + 1;
    return `ORD-${String(seq).padStart(6, '0')}`;
  }

  // ─── Writes ──────────────────────────────────────────────────

  /**
   * Persists a newly created DRAFT order within an existing transaction.
   * Called from OrdersService.createOrder() which manages the transaction.
   */
  async createInTx(
    tx: Prisma.TransactionClient,
    data: {
      orderNumber: string;
      customerId: string;
      customerAccountId: string;
      pricingCalculationId: string;
      totalAmountRial: Decimal;
      weightGrams: Decimal;
      purityRatio: Decimal;
      customerType: CustomerType | null;
      item: {
        weightGrams: Decimal;
        purityRatio: Decimal;
        unitPriceRial: Decimal;
        totalPriceRial: Decimal;
        metadata?: Prisma.InputJsonValue;
      };
    },
  ): Promise<OrderEntity> {
    const row = await tx.order.create({
      data: {
        orderNumber: data.orderNumber,
        customerId: data.customerId,
        customerAccountId: data.customerAccountId,
        pricingCalculationId: data.pricingCalculationId,
        status: 'DRAFT',
        totalAmountRial: data.totalAmountRial,
        reservedAmountRial: new Decimal(0),
        weightGrams: data.weightGrams,
        purityRatio: data.purityRatio,
        customerType: data.customerType ?? null,
        items: {
          create: {
            weightGrams: data.item.weightGrams,
            purityRatio: data.item.purityRatio,
            unitPriceRial: data.item.unitPriceRial,
            totalPriceRial: data.item.totalPriceRial,
            ...(data.item.metadata ? { metadata: data.item.metadata } : {}),
          },
        },
      },
      include: { items: true },
    });
    return this.toDomain(row);
  }

  /**
   * Marks an order as SUBMITTED and records the reserved amount.
   * Must be called within the credit reservation transaction — §3.3.
   */
  async submitInTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    reservedAmountRial: Decimal,
  ): Promise<void> {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'SUBMITTED',
        reservedAmountRial,
        submittedAt: new Date(),
      },
    });
  }

  /**
   * Marks an order as CANCELLED.
   * Must be called within the credit release transaction when order was SUBMITTED.
   */
  async cancelInTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    params: {
      cancellationReason: string;
      cancelledByUserId: string;
    },
  ): Promise<void> {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        cancellationReason: params.cancellationReason,
        cancelledByUserId: params.cancelledByUserId,
        cancelledAt: new Date(),
      },
    });
  }

  /**
   * Marks a DRAFT order as CANCELLED (no credit release needed).
   * Uses its own transaction since no credit operation is needed.
   */
  async cancelDraft(
    orderId: string,
    params: {
      cancellationReason: string;
      cancelledByUserId: string;
    },
  ): Promise<void> {
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        cancellationReason: params.cancellationReason,
        cancelledByUserId: params.cancelledByUserId,
        cancelledAt: new Date(),
      },
    });
  }

  /**
   * Marks an order as REJECTED.
   * Must be called within the credit release transaction.
   */
  async rejectInTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    params: {
      rejectionReason: string;
      rejectedByUserId: string;
    },
  ): Promise<void> {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'REJECTED',
        rejectionReason: params.rejectionReason,
        rejectedByUserId: params.rejectedByUserId,
        rejectedAt: new Date(),
      },
    });
  }

  // ─── Mapping ─────────────────────────────────────────────────

  private toDomain(row: OrderRow): OrderEntity {
    return new OrderEntity({
      id: row.id,
      orderNumber: row.orderNumber,
      customerId: row.customerId,
      customerAccountId: row.customerAccountId,
      pricingCalculationId: row.pricingCalculationId ?? null,
      status: row.status as OrderStatus,
      totalAmountRial: new Decimal(row.totalAmountRial.toString()),
      reservedAmountRial: new Decimal(row.reservedAmountRial.toString()),
      weightGrams: new Decimal(row.weightGrams.toString()),
      purityRatio: new Decimal(row.purityRatio.toString()),
      customerType: (row.customerType as CustomerType) ?? null,
      submittedAt: row.submittedAt ?? null,
      cancelledAt: row.cancelledAt ?? null,
      rejectedAt: row.rejectedAt ?? null,
      cancellationReason: row.cancellationReason ?? null,
      cancelledByUserId: row.cancelledByUserId ?? null,
      rejectionReason: row.rejectionReason ?? null,
      rejectedByUserId: row.rejectedByUserId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  itemToDomain(row: ItemRow): OrderItemEntity {
    return new OrderItemEntity({
      id: row.id,
      orderId: row.orderId,
      weightGrams: new Decimal(row.weightGrams.toString()),
      purityRatio: new Decimal(row.purityRatio.toString()),
      unitPriceRial: new Decimal(row.unitPriceRial.toString()),
      totalPriceRial: new Decimal(row.totalPriceRial.toString()),
      description: row.description ?? null,
      metadata: row.metadata,
      createdAt: row.createdAt,
    });
  }

  /** Convenience: get items from a loaded row (already eager-loaded) */
  getItemsFromRow(row: OrderRow): OrderItemEntity[] {
    return row.items.map((i) => this.itemToDomain(i));
  }
}
