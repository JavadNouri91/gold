import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import { QuotationStatus, PaginationMeta } from '@gold/shared-types';

import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { QuotationRepository } from '../infrastructure/repositories/quotation.repository';
import { QuotationDocumentService } from './quotation-document.service';
import { QuotationEntity } from '../domain/entities/quotation.entity';
import { QuotationItemEntity } from '../domain/entities/quotation-item.entity';
import { QuotationResponseDto, QuotationDownloadResponseDto } from './dto/quotation-response.dto';
import { ListQuotationsDto } from './dto/list-quotations.dto';
import {
  QuotationNotFoundException,
  DuplicateQuotationException,
  QuotationDocumentNotReadyException,
} from '../domain/exceptions/quotation.exceptions';

/** Input for auto-generating a Quotation after Order submission */
export interface GenerateQuotationInput {
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerType: string | null;
  pricingCalculationId: string;
  totalAmountRial: Decimal;
  weightGrams: Decimal;
  purityRatio: Decimal;
  /** From PricingCalculation.step1BasePrice */
  step1BasePrice: Decimal;
  /** From PricingCalculation.wageAmount */
  wageAmount: Decimal;
  /** From PricingCalculation.discountAmount */
  discountAmount: Decimal;
  /** From PricingCalculation.roundingAmount */
  roundingAmount: Decimal;
  /** From PricingCalculation.isComplete */
  isComplete: boolean;
  /** From PricingCalculation.blockedSteps (JSON array) */
  blockedSteps: string[];
  /** Per-gram unit price for the line item */
  unitPriceRial: Decimal;
  actorId: string;
}

@Injectable()
export class QuotationsService {
  private readonly logger = new Logger(QuotationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quotationRepo: QuotationRepository,
    private readonly documentService: QuotationDocumentService,
    private readonly audit: AuditService,
  ) {}

  // ─── Auto-generation ──────────────────────────────────────────

  /**
   * Automatically generates a Quotation for a submitted Order.
   *
   * Called by OrdersService.submitOrder() immediately after credit reservation.
   * This call also transitions the Order from SUBMITTED → QUOTED.
   *
   * PROCESS:
   *   1. Duplicate guard — unique constraint on (orderId, version=1)
   *   2. Generate document content from locked pricing snapshot
   *   3. Upload document to S3/MinIO (non-fatal: Quotation created even if upload fails)
   *   4. In one transaction:
   *      a. Create Quotation + QuotationItem
   *      b. Transition Order: SUBMITTED → QUOTED
   *   5. Audit log
   *
   * IMMUTABILITY:
   *   The financial values are taken from the PricingCalculation that was locked
   *   at Order submission (§2.1). They are NEVER updated due to gold price changes (§2.2).
   *
   * docs/21-business-decisions.md §2, UC-08
   */
  async generateForOrder(input: GenerateQuotationInput): Promise<QuotationEntity> {
    const { orderId, actorId } = input;

    // ── 1. Duplicate guard ────────────────────────────────────────
    const alreadyExists = await this.quotationRepo.existsForOrderVersion(orderId, 1);
    if (alreadyExists) {
      throw new DuplicateQuotationException(orderId);
    }

    // ── 2. Build document data (locked snapshot — no recalculation) ──
    const documentData = {
      quotationNumber: '', // filled after number generation
      orderNumber: input.orderNumber,
      version: 1,
      generatedAt: new Date(),
      customer: {
        id: input.customerId,
        name: input.customerName,
        customerType: input.customerType,
      },
      items: [
        {
          weightGrams: input.weightGrams,
          purityRatio: input.purityRatio,
          unitPriceRial: input.unitPriceRial,
          totalPriceRial: input.totalAmountRial,
        },
      ],
      pricing: {
        step1BasePrice: input.step1BasePrice,
        wageAmount: input.wageAmount,
        discountAmount: input.discountAmount,
        roundingAmount: input.roundingAmount,
        totalAmountRial: input.totalAmountRial,
        isComplete: input.isComplete,
        blockedSteps: input.blockedSteps,
      },
    };

    // ── 3. Transaction: create Quotation + transition Order to QUOTED ─
    const quotation = await this.prisma.$transaction(async (tx) => {
      // Generate quotation number inside transaction (sequential)
      const quotationNumber = await this.quotationRepo.nextQuotationNumber(tx);
      documentData.quotationNumber = quotationNumber;

      // ── 3a. Upload document (outside the DB transaction for S3 isolation)
      // NOTE: Document upload cannot participate in a DB transaction.
      // If the document upload fails, we proceed with documentKey=null.
      // The Quotation is still created; document can be regenerated.
      let documentKey: string | null = null;
      let documentMimeType: string | null = null;
      let documentGeneratedAt: Date | null = null;

      const generated = await this.documentService.generate({
        ...documentData,
        quotationNumber,
      });

      if (generated) {
        documentKey = generated.key;
        documentMimeType = generated.mimeType;
        documentGeneratedAt = generated.generatedAt;
      }

      // ── 3b. Create Quotation record
      const created = await this.quotationRepo.createInTx(tx, {
        quotationNumber,
        orderId: input.orderId,
        customerId: input.customerId,
        pricingCalculationId: input.pricingCalculationId,
        version: 1,
        totalAmountRial: input.totalAmountRial,
        weightGrams: input.weightGrams,
        purityRatio: input.purityRatio,
        step1BasePrice: input.step1BasePrice,
        wageAmount: input.wageAmount,
        discountAmount: input.discountAmount,
        roundingAmount: input.roundingAmount,
        isComplete: input.isComplete,
        documentKey,
        documentMimeType,
        documentGeneratedAt,
        item: {
          weightGrams: input.weightGrams,
          purityRatio: input.purityRatio,
          unitPriceRial: input.unitPriceRial,
          totalPriceRial: input.totalAmountRial,
        },
      });

      // ── 3c. Transition Order: SUBMITTED → QUOTED
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'QUOTED', updatedAt: new Date() },
      });

      return created;
    });

    // ── 4. Audit ──────────────────────────────────────────────────
    await this.audit.log({
      actorId,
      actorType: 'SYSTEM',
      action: 'QUOTATION_GENERATED',
      entityType: 'Quotation',
      entityId: quotation.id,
      after: {
        quotationNumber: quotation.quotationNumber,
        orderId,
        version: 1,
        status: QuotationStatus.ACTIVE,
        totalAmountRial: quotation.totalAmountRial.toFixed(2),
        documentKey: quotation.documentKey,
        isComplete: quotation.isComplete,
      },
    });

    // Separately audit the Order status change
    await this.audit.log({
      actorId,
      actorType: 'SYSTEM',
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'Order',
      entityId: orderId,
      before: { status: 'SUBMITTED' },
      after: { status: 'QUOTED', quotationId: quotation.id },
    });

    this.logger.log(
      `Quotation generated: ${quotation.quotationNumber} for order ${orderId} ` +
        `(total: ${quotation.totalAmountRial.toFixed(2)} Rial, document: ${quotation.documentKey ?? 'PENDING'})`,
    );

    return quotation;
  }

  /**
   * Expires all ACTIVE Quotations for an Order.
   * Called within the same transaction as Order cancellation/rejection.
   *
   * ATOMICITY: The Quotation expiry must be in the same transaction as
   * the credit release and Order status update, so all changes commit or roll back together.
   *
   * §2.3: EXPIRED state applies ONLY when Order is cancelled — NOT time-based.
   * Credit release is NOT managed here; it remains the responsibility of OrdersService (§3.5).
   */
  async expireForOrderInTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    _actorId: string,
  ): Promise<void> {
    const expiredCount = await this.quotationRepo.expireActiveForOrderInTx(tx, orderId);

    if (expiredCount > 0) {
      // Note: audit inside a transaction — AuditService uses PrismaService which gets a fresh client.
      // We log after the transaction for safety.
      this.logger.log(`Expired ${expiredCount} quotation(s) for cancelled order ${orderId}`);
    }
  }

  /**
   * Post-cancellation audit for quotation expiry.
   * Called AFTER the transaction that cancelled the Order (not inside it).
   */
  async auditQuotationExpiry(orderId: string, actorId: string): Promise<void> {
    // Find expired quotations for this order to log them
    const quotations = await this.quotationRepo.findByOrderId(orderId);
    const expired = quotations.filter((q) => q.status === QuotationStatus.EXPIRED);

    for (const q of expired) {
      await this.audit.log({
        actorId,
        actorType: 'USER',
        action: 'QUOTATION_EXPIRED',
        entityType: 'Quotation',
        entityId: q.id,
        before: { status: QuotationStatus.ACTIVE },
        after: { status: QuotationStatus.EXPIRED },
        reason: 'Associated Order was cancelled',
      });
    }
  }

  // ─── Customer queries ─────────────────────────────────────────

  /**
   * Gets all Quotations for a specific Order.
   *
   * Customer: only own orders (customer isolation — orderId + customerId check).
   * Staff: any order.
   */
  async getQuotationsForOrder(
    orderId: string,
    actorUserId: string,
    isStaff: boolean,
  ): Promise<QuotationResponseDto[]> {
    let quotations: QuotationEntity[];

    if (isStaff) {
      quotations = await this.quotationRepo.findByOrderId(orderId);
    } else {
      const customerId = await this.resolveCustomerId(actorUserId);
      quotations = await this.quotationRepo.findByOrderIdForCustomer(orderId, customerId);
    }

    return quotations.map((q) => this.toResponse(q, []));
  }

  /**
   * Gets a single Quotation by ID.
   *
   * Customer: only own quotations (customer isolation).
   * Staff: any quotation.
   */
  async getQuotation(
    quotationId: string,
    actorUserId: string,
    isStaff: boolean,
  ): Promise<QuotationResponseDto> {
    let quotation: QuotationEntity | null;

    if (isStaff) {
      quotation = await this.quotationRepo.findById(quotationId);
    } else {
      const customerId = await this.resolveCustomerId(actorUserId);
      quotation = await this.quotationRepo.findByIdForCustomer(quotationId, customerId);
    }

    if (!quotation) throw new QuotationNotFoundException(quotationId);

    // Audit view (BR-S02: sensitive operations audited)
    // Note: We don't audit simple reads in Phase 3.4 for performance.
    // Document views/downloads are audited separately.

    return this.toResponse(quotation, []);
  }

  /**
   * Lists all Quotations for the authenticated customer.
   *
   * Customer isolation: customers only see their own quotations.
   * Staff with quotation.read: see all.
   */
  async listQuotations(
    actorUserId: string,
    dto: ListQuotationsDto,
    isStaff: boolean,
  ): Promise<{ quotations: QuotationResponseDto[]; meta: PaginationMeta }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const customerId = isStaff ? null : await this.resolveCustomerId(actorUserId);

    // For staff we'd need a findAll — for Phase 3.4, customer-only listing
    const { quotations, total } = await this.quotationRepo.findByCustomerId(
      customerId ?? '', // for staff, this would be filtered differently in a later phase
      { page, limit },
    );

    return {
      quotations: quotations.map((q) => this.toResponse(q, [])),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Returns a pre-signed download URL for a Quotation document.
   *
   * AUDIT: Every download must be audited (BR-S02).
   * CUSTOMER ISOLATION: Customers can only download their own quotation documents.
   * IMMUTABILITY: The document is the locked snapshot — never a recalculation.
   */
  async getDownloadUrl(
    quotationId: string,
    actorUserId: string,
    isStaff: boolean,
  ): Promise<QuotationDownloadResponseDto> {
    let quotation: QuotationEntity | null;

    if (isStaff) {
      quotation = await this.quotationRepo.findById(quotationId);
    } else {
      const customerId = await this.resolveCustomerId(actorUserId);
      quotation = await this.quotationRepo.findByIdForCustomer(quotationId, customerId);
    }

    if (!quotation) throw new QuotationNotFoundException(quotationId);

    if (!quotation.hasDocument()) {
      throw new QuotationDocumentNotReadyException(quotationId);
    }

    const downloadUrl = await this.documentService.getDownloadUrl(quotation.documentKey!);

    // Audit: document download (BR-S02, §7.3 principle)
    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'QUOTATION_DOCUMENT_DOWNLOADED',
      entityType: 'Quotation',
      entityId: quotationId,
      after: {
        quotationNumber: quotation.quotationNumber,
        documentKey: quotation.documentKey,
      },
    });

    return {
      quotationId: quotation.id,
      quotationNumber: quotation.quotationNumber,
      downloadUrl,
      mimeType: quotation.documentMimeType ?? 'application/json',
      expiresIn: 'See STORAGE_SIGNED_URL_TTL_SECONDS environment configuration',
    };
  }

  // ─── Private helpers ──────────────────────────────────────────

  /**
   * Resolves the Customer ID from an authenticated user ID.
   * Returns QuotationNotFoundException (404) if no Customer profile exists,
   * to prevent information leakage about whether the record exists.
   */
  private async resolveCustomerId(actorUserId: string): Promise<string> {
    const customer = await this.prisma.customer.findUnique({
      where: { userId: actorUserId },
      select: { id: true },
    });
    if (!customer) throw new QuotationNotFoundException('(no customer profile)');
    return customer.id;
  }

  // ─── Response mapping ─────────────────────────────────────────

  toResponse(quotation: QuotationEntity, _items: QuotationItemEntity[]): QuotationResponseDto {
    const dto = new QuotationResponseDto();
    dto.id = quotation.id;
    dto.quotationNumber = quotation.quotationNumber;
    dto.orderId = quotation.orderId;
    dto.customerId = quotation.customerId;
    dto.pricingCalculationId = quotation.pricingCalculationId;
    dto.version = quotation.version;
    dto.status = quotation.status;
    dto.totalAmountRial = quotation.totalAmountRial.toFixed(2);
    dto.weightGrams = quotation.weightGrams.toFixed(6);
    dto.purityRatio = quotation.purityRatio.toFixed(6);
    dto.step1BasePrice = quotation.step1BasePrice?.toFixed(6) ?? null;
    dto.wageAmount = quotation.wageAmount?.toFixed(2) ?? null;
    dto.discountAmount = quotation.discountAmount?.toFixed(2) ?? null;
    dto.roundingAmount = quotation.roundingAmount?.toFixed(2) ?? null;
    dto.isComplete = quotation.isComplete;
    dto.documentAvailable = quotation.hasDocument();
    dto.generatedAt = quotation.generatedAt;
    dto.createdAt = quotation.createdAt;
    dto.updatedAt = quotation.updatedAt;
    dto.items = [];
    return dto;
  }
}
