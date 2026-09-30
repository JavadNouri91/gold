import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { QuotationStatus } from '@gold/shared-types';
import { PrismaService } from '../../../../database/prisma.service';
import { QuotationEntity } from '../../domain/entities/quotation.entity';
import { QuotationItemEntity } from '../../domain/entities/quotation-item.entity';

type QuotationRow = Prisma.QuotationGetPayload<{ include: { items: true } }>;
type QuotationRowBase = Prisma.QuotationGetPayload<Record<string, never>>;
type QuotationItemRow = Prisma.QuotationItemGetPayload<Record<string, never>>;

@Injectable()
export class QuotationRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Reads ───────────────────────────────────────────────────

  async findById(id: string): Promise<QuotationEntity | null> {
    const row = await this.prisma.quotation.findUnique({
      where: { id },
      include: { items: true },
    });
    return row ? this.toDomain(row) : null;
  }

  /** Customer-scoped lookup — enforces customer isolation */
  async findByIdForCustomer(id: string, customerId: string): Promise<QuotationEntity | null> {
    const row = await this.prisma.quotation.findFirst({
      where: { id, customerId },
      include: { items: true },
    });
    return row ? this.toDomain(row) : null;
  }

  /** Get all quotations for a specific order */
  async findByOrderId(orderId: string): Promise<QuotationEntity[]> {
    const rows = await this.prisma.quotation.findMany({
      where: { orderId },
      include: { items: true },
      orderBy: { version: 'asc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  /** Customer-scoped: get quotations for a specific order */
  async findByOrderIdForCustomer(orderId: string, customerId: string): Promise<QuotationEntity[]> {
    const rows = await this.prisma.quotation.findMany({
      where: { orderId, customerId },
      include: { items: true },
      orderBy: { version: 'asc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  /** Get all quotations for a customer */
  async findByCustomerId(
    customerId: string,
    opts: { page: number; limit: number },
  ): Promise<{ quotations: QuotationEntity[]; total: number }> {
    const skip = (opts.page - 1) * opts.limit;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.quotation.findMany({
        where: { customerId },
        include: { items: true },
        orderBy: { generatedAt: 'desc' },
        skip,
        take: opts.limit,
      }),
      this.prisma.quotation.count({ where: { customerId } }),
    ]);
    return { quotations: rows.map((r) => this.toDomain(r)), total };
  }

  /** Check if a Quotation with this orderId and version already exists */
  async existsForOrderVersion(orderId: string, version: number): Promise<boolean> {
    const count = await this.prisma.quotation.count({
      where: { orderId, version },
    });
    return count > 0;
  }

  // ─── Sequence ────────────────────────────────────────────────

  /**
   * Generates the next sequential quotation number within a transaction.
   * Format: QT-000001, QT-000002, …
   * Must be called inside a Prisma transaction.
   */
  async nextQuotationNumber(tx: Prisma.TransactionClient): Promise<string> {
    const count = await tx.quotation.count();
    const seq = count + 1;
    return `QT-${String(seq).padStart(6, '0')}`;
  }

  // ─── Writes ──────────────────────────────────────────────────

  /**
   * Creates a Quotation record within an existing transaction.
   *
   * IDEMPOTENCY: The unique constraint on (orderId, version) prevents duplicates.
   * If this is called twice for the same order+version, the DB will reject it
   * with a unique constraint error.
   */
  async createInTx(
    tx: Prisma.TransactionClient,
    data: {
      quotationNumber: string;
      orderId: string;
      customerId: string;
      pricingCalculationId: string;
      version: number;
      totalAmountRial: Decimal;
      weightGrams: Decimal;
      purityRatio: Decimal;
      step1BasePrice: Decimal | null;
      wageAmount: Decimal | null;
      discountAmount: Decimal | null;
      roundingAmount: Decimal | null;
      isComplete: boolean;
      documentKey: string | null;
      documentMimeType: string | null;
      documentGeneratedAt: Date | null;
      item: {
        weightGrams: Decimal;
        purityRatio: Decimal;
        unitPriceRial: Decimal;
        totalPriceRial: Decimal;
      };
    },
  ): Promise<QuotationEntity> {
    const row = await tx.quotation.create({
      data: {
        quotationNumber: data.quotationNumber,
        orderId: data.orderId,
        customerId: data.customerId,
        pricingCalculationId: data.pricingCalculationId,
        version: data.version,
        status: 'ACTIVE',
        totalAmountRial: data.totalAmountRial,
        weightGrams: data.weightGrams,
        purityRatio: data.purityRatio,
        step1BasePrice: data.step1BasePrice ?? undefined,
        wageAmount: data.wageAmount ?? undefined,
        discountAmount: data.discountAmount ?? undefined,
        roundingAmount: data.roundingAmount ?? undefined,
        isComplete: data.isComplete,
        documentKey: data.documentKey ?? null,
        documentMimeType: data.documentMimeType ?? null,
        documentGeneratedAt: data.documentGeneratedAt ?? null,
        items: {
          create: {
            weightGrams: data.item.weightGrams,
            purityRatio: data.item.purityRatio,
            unitPriceRial: data.item.unitPriceRial,
            totalPriceRial: data.item.totalPriceRial,
          },
        },
      },
      include: { items: true },
    });
    return this.toDomain(row);
  }

  /**
   * Updates the document key on a Quotation after document generation.
   * Called after successful S3 upload.
   */
  async updateDocumentKey(
    quotationId: string,
    documentKey: string,
    mimeType: string,
  ): Promise<void> {
    await this.prisma.quotation.update({
      where: { id: quotationId },
      data: {
        documentKey,
        documentMimeType: mimeType,
        documentGeneratedAt: new Date(),
      },
    });
  }

  /**
   * Expires all ACTIVE Quotations for a given Order.
   * Called atomically within the Order cancellation or rejection transaction.
   *
   * §2.3: EXPIRED state applies ONLY when Order is cancelled (not time-based).
   */
  async expireActiveForOrderInTx(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
    const result = await tx.quotation.updateMany({
      where: { orderId, status: 'ACTIVE' },
      data: { status: 'EXPIRED', updatedAt: new Date() },
    });
    return result.count;
  }

  // ─── Mapping ─────────────────────────────────────────────────

  toDomain(row: QuotationRow): QuotationEntity {
    return new QuotationEntity({
      id: row.id,
      quotationNumber: row.quotationNumber,
      orderId: row.orderId,
      customerId: row.customerId,
      pricingCalculationId: row.pricingCalculationId,
      version: row.version,
      status: row.status as QuotationStatus,
      totalAmountRial: new Decimal(row.totalAmountRial.toString()),
      weightGrams: new Decimal(row.weightGrams.toString()),
      purityRatio: new Decimal(row.purityRatio.toString()),
      step1BasePrice: row.step1BasePrice ? new Decimal(row.step1BasePrice.toString()) : null,
      wageAmount: row.wageAmount ? new Decimal(row.wageAmount.toString()) : null,
      discountAmount: row.discountAmount ? new Decimal(row.discountAmount.toString()) : null,
      roundingAmount: row.roundingAmount ? new Decimal(row.roundingAmount.toString()) : null,
      isComplete: row.isComplete,
      documentKey: row.documentKey ?? null,
      documentMimeType: row.documentMimeType ?? null,
      documentGeneratedAt: row.documentGeneratedAt ?? null,
      generatedAt: row.generatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      items: row.items.map((item) => this.itemToDomain(item)),
    });
  }

  toDomainBase(row: QuotationRowBase): QuotationEntity {
    return new QuotationEntity({
      id: row.id,
      quotationNumber: row.quotationNumber,
      orderId: row.orderId,
      customerId: row.customerId,
      pricingCalculationId: row.pricingCalculationId,
      version: row.version,
      status: row.status as QuotationStatus,
      totalAmountRial: new Decimal(row.totalAmountRial.toString()),
      weightGrams: new Decimal(row.weightGrams.toString()),
      purityRatio: new Decimal(row.purityRatio.toString()),
      step1BasePrice: row.step1BasePrice ? new Decimal(row.step1BasePrice.toString()) : null,
      wageAmount: row.wageAmount ? new Decimal(row.wageAmount.toString()) : null,
      discountAmount: row.discountAmount ? new Decimal(row.discountAmount.toString()) : null,
      roundingAmount: row.roundingAmount ? new Decimal(row.roundingAmount.toString()) : null,
      isComplete: row.isComplete,
      documentKey: row.documentKey ?? null,
      documentMimeType: row.documentMimeType ?? null,
      documentGeneratedAt: row.documentGeneratedAt ?? null,
      generatedAt: row.generatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  itemToDomain(row: QuotationItemRow): QuotationItemEntity {
    return new QuotationItemEntity({
      id: row.id,
      quotationId: row.quotationId,
      weightGrams: new Decimal(row.weightGrams.toString()),
      purityRatio: new Decimal(row.purityRatio.toString()),
      unitPriceRial: new Decimal(row.unitPriceRial.toString()),
      totalPriceRial: new Decimal(row.totalPriceRial.toString()),
      description: row.description ?? null,
      createdAt: row.createdAt,
    });
  }

  getItemsFromRow(row: QuotationRow): QuotationItemEntity[] {
    return row.items.map((i) => this.itemToDomain(i));
  }
}
