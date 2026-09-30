import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../../database/prisma.service';
import { PurchaseEntity, PurchaseItemEntity } from '../../domain/entities/purchase.entity';
import { PurchaseStatus, PurchaseSettlementType } from '../../domain/constants/purchase-states';

/**
 * Purchase Repository
 *
 * All confirmation write operations are performed inside a Prisma transaction
 * provided by the caller to ensure atomicity with ledger postings and
 * SupplierAccount updates.
 */
@Injectable()
export class PurchaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Read Operations ─────────────────────────────────────────────────────────

  async findById(id: string): Promise<PurchaseEntity | null> {
    const row = await this.prisma.purchase.findUnique({ where: { id } });
    return row ? this.mapRow(row) : null;
  }

  async findByIdWithItems(
    id: string,
  ): Promise<{ purchase: PurchaseEntity; items: PurchaseItemEntity[] } | null> {
    const row = await this.prisma.purchase.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!row) return null;
    return { purchase: this.mapRow(row), items: row.items.map((i) => this.mapItemRow(i)) };
  }

  async findByIdempotencyKey(key: string): Promise<PurchaseEntity | null> {
    const row = await this.prisma.purchase.findUnique({ where: { idempotencyKey: key } });
    return row ? this.mapRow(row) : null;
  }

  async findAll(opts: {
    supplierId?: string;
    status?: PurchaseStatus;
    limit?: number;
    offset?: number;
  }): Promise<PurchaseEntity[]> {
    const rows = await this.prisma.purchase.findMany({
      where: {
        ...(opts.supplierId ? { supplierId: opts.supplierId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 50,
      skip: opts.offset ?? 0,
    });
    return rows.map((r) => this.mapRow(r));
  }

  // ─── Write Operations ─────────────────────────────────────────────────────────

  async createInTx(
    tx: Prisma.TransactionClient,
    input: {
      purchaseNumber: string;
      idempotencyKey: string;
      supplierId: string;
      settlementType: PurchaseSettlementType;
      purchaseDate: Date;
      totalAmountRial: Decimal;
      weightGrams: Decimal;
      purityRatio: Decimal;
      pricePerGramRial: Decimal;
      supplierReference: string | null;
      notes: string | null;
      recordedByUserId: string | null;
      items: Array<{
        weightGrams: Decimal;
        purityRatio: Decimal;
        pricePerGramRial: Decimal;
        totalAmountRial: Decimal;
        description: string | null;
      }>;
    },
  ): Promise<PurchaseEntity> {
    const row = await tx.purchase.create({
      data: {
        purchaseNumber: input.purchaseNumber,
        idempotencyKey: input.idempotencyKey,
        supplierId: input.supplierId,
        settlementType: input.settlementType,
        purchaseDate: input.purchaseDate,
        totalAmountRial: input.totalAmountRial.toFixed(2),
        weightGrams: input.weightGrams.toFixed(6),
        purityRatio: input.purityRatio.toFixed(6),
        pricePerGramRial: input.pricePerGramRial.toFixed(6),
        supplierReference: input.supplierReference,
        notes: input.notes,
        recordedByUserId: input.recordedByUserId,
        status: 'DRAFT',
        items: {
          create: input.items.map((item) => ({
            weightGrams: item.weightGrams.toFixed(6),
            purityRatio: item.purityRatio.toFixed(6),
            pricePerGramRial: item.pricePerGramRial.toFixed(6),
            totalAmountRial: item.totalAmountRial.toFixed(2),
            description: item.description,
          })),
        },
      },
    });
    return this.mapRow(row);
  }

  async confirmInTx(
    tx: Prisma.TransactionClient,
    purchaseId: string,
    confirmedByUserId: string,
  ): Promise<PurchaseEntity> {
    const row = await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        status: 'CONFIRMED',
        confirmedByUserId,
        confirmedAt: new Date(),
      },
    });
    return this.mapRow(row);
  }

  async cancelInTx(
    tx: Prisma.TransactionClient,
    purchaseId: string,
    cancelledByUserId: string,
    reason: string,
  ): Promise<PurchaseEntity> {
    const row = await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        status: 'CANCELLED',
        cancelledByUserId,
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });
    return this.mapRow(row);
  }

  async nextPurchaseNumber(): Promise<string> {
    const count = await this.prisma.purchase.count();
    return `PUR-${String(count + 1).padStart(6, '0')}`;
  }

  // ─── Mapping Helpers ─────────────────────────────────────────────────────────

  mapRow(row: {
    id: string;
    purchaseNumber: string;
    idempotencyKey: string;
    supplierId: string;
    status: string;
    settlementType: string;
    purchaseDate: Date;
    totalAmountRial: Decimal | string | number | { toString(): string };
    weightGrams: Decimal | string | number | { toString(): string };
    purityRatio: Decimal | string | number | { toString(): string };
    pricePerGramRial: Decimal | string | number | { toString(): string };
    supplierReference: string | null;
    notes: string | null;
    recordedByUserId: string | null;
    confirmedByUserId: string | null;
    confirmedAt: Date | null;
    cancelledByUserId: string | null;
    cancelledAt: Date | null;
    cancellationReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PurchaseEntity {
    return new PurchaseEntity({
      id: row.id,
      purchaseNumber: row.purchaseNumber,
      idempotencyKey: row.idempotencyKey,
      supplierId: row.supplierId,
      status: row.status as PurchaseStatus,
      settlementType: row.settlementType as PurchaseSettlementType,
      purchaseDate: row.purchaseDate,
      totalAmountRial: new Decimal(row.totalAmountRial.toString()),
      weightGrams: new Decimal(row.weightGrams.toString()),
      purityRatio: new Decimal(row.purityRatio.toString()),
      pricePerGramRial: new Decimal(row.pricePerGramRial.toString()),
      supplierReference: row.supplierReference,
      notes: row.notes,
      recordedByUserId: row.recordedByUserId,
      confirmedByUserId: row.confirmedByUserId,
      confirmedAt: row.confirmedAt,
      cancelledByUserId: row.cancelledByUserId,
      cancelledAt: row.cancelledAt,
      cancellationReason: row.cancellationReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private mapItemRow(row: {
    id: string;
    purchaseId: string;
    weightGrams: Decimal | string | number | { toString(): string };
    purityRatio: Decimal | string | number | { toString(): string };
    pricePerGramRial: Decimal | string | number | { toString(): string };
    totalAmountRial: Decimal | string | number | { toString(): string };
    description: string | null;
    createdAt: Date;
  }): PurchaseItemEntity {
    return new PurchaseItemEntity({
      id: row.id,
      purchaseId: row.purchaseId,
      weightGrams: new Decimal(row.weightGrams.toString()),
      purityRatio: new Decimal(row.purityRatio.toString()),
      pricePerGramRial: new Decimal(row.pricePerGramRial.toString()),
      totalAmountRial: new Decimal(row.totalAmountRial.toString()),
      description: row.description,
      createdAt: row.createdAt,
    });
  }
}
