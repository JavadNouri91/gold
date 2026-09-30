import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';

import { PrismaService } from '../../../database/prisma.service';
import { PurchaseRepository } from '../infrastructure/repositories/purchase.repository';
import { SupplierRepository } from '../../suppliers/infrastructure/repositories/supplier.repository';
import { PurchaseLedgerService } from './purchase-ledger.service';
import { AuditService } from '../../audit/application/audit.service';
import { PurchaseEntity } from '../domain/entities/purchase.entity';
import { PurchaseStatus, PurchaseSettlementType } from '../domain/constants/purchase-states';
import {
  PurchaseNotFoundException,
  InvalidPurchaseTransitionException,
  InvalidPurchaseAmountException,
  InvalidPurchaseWeightException,
  PurchaseSupplierSettlementDeferredException,
} from '../domain/exceptions/purchase.exceptions';
import {
  SupplierNotFoundException,
  SupplierNotActiveException,
} from '../../suppliers/domain/exceptions/supplier.exceptions';

// ─── Response DTOs ────────────────────────────────────────────────────────────

export class PurchaseResponseDto {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  status: string;
  settlementType: string;
  purchaseDate: string;
  totalAmountRial: string;
  weightGrams: string;
  purityRatio: string;
  pricePerGramRial: string;
  supplierReference: string | null;
  notes: string | null;
  recordedByUserId: string | null;
  confirmedByUserId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;

  static from(e: PurchaseEntity): PurchaseResponseDto {
    const d = new PurchaseResponseDto();
    d.id = e.id;
    d.purchaseNumber = e.purchaseNumber;
    d.supplierId = e.supplierId;
    d.status = e.status;
    d.settlementType = e.settlementType;
    d.purchaseDate = e.purchaseDate.toISOString();
    d.totalAmountRial = e.totalAmountRial.toFixed(2);
    d.weightGrams = e.weightGrams.toFixed(6);
    d.purityRatio = e.purityRatio.toFixed(6);
    d.pricePerGramRial = e.pricePerGramRial.toFixed(6);
    d.supplierReference = e.supplierReference;
    d.notes = e.notes;
    d.recordedByUserId = e.recordedByUserId;
    d.confirmedByUserId = e.confirmedByUserId;
    d.confirmedAt = e.confirmedAt?.toISOString() ?? null;
    d.createdAt = e.createdAt.toISOString();
    d.updatedAt = e.updatedAt.toISOString();
    return d;
  }
}

/**
 * Purchase Service
 *
 * Manages the upstream gold purchase lifecycle.
 * Manual entry only in MVP (docs/21-business-decisions.md §11.2).
 *
 * State machine: DRAFT → CONFIRMED (MVP scope)
 * SETTLING / SETTLED: DEFERRED §8.4
 *
 * On CONFIRMED:
 *   1. Financial Ledger: DR FA-08 / CR FA-03 (atomic with Purchase confirmation)
 *   2. Gold Ledger: BLOCKED (#22, #39 open)
 *   3. SupplierAccount.totalPurchasedRial += purchase.totalAmountRial
 *   4. Audit logged
 *
 * All financial values use Decimal — BR-P05 (never Float).
 *
 * IDEMPOTENCY: unique idempotencyKey on Purchase prevents duplicate effects.
 * ATOMICITY: confirmation + ledger + supplier account update are one $transaction.
 */
@Injectable()
export class PurchaseService {
  private readonly logger = new Logger(PurchaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly purchaseRepo: PurchaseRepository,
    private readonly supplierRepo: SupplierRepository,
    private readonly purchaseLedger: PurchaseLedgerService,
    private readonly audit: AuditService,
  ) {}

  // ─── Create Purchase (DRAFT) ──────────────────────────────────────────────────

  /**
   * Creates a new Purchase in DRAFT status.
   *
   * Validates:
   * - Supplier exists and is ACTIVE
   * - Amount, weight, purityRatio are positive Decimals
   * - No duplicate idempotency key
   *
   * No ledger entries created at DRAFT — only at CONFIRMED.
   */
  async createPurchase(
    input: {
      idempotencyKey: string;
      supplierId: string;
      settlementType: PurchaseSettlementType;
      purchaseDate: Date;
      totalAmountRial: string;
      weightGrams: string;
      purityRatio: string;
      pricePerGramRial: string;
      supplierReference?: string;
      notes?: string;
      items?: Array<{
        weightGrams: string;
        purityRatio: string;
        pricePerGramRial: string;
        totalAmountRial: string;
        description?: string;
      }>;
    },
    actorUserId: string,
  ): Promise<{ purchase: PurchaseResponseDto; wasAlreadyCreated: boolean }> {
    // ── Idempotency check ────────────────────────────────────────────────────
    const existing = await this.purchaseRepo.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return { purchase: PurchaseResponseDto.from(existing), wasAlreadyCreated: true };
    }

    // ── Validate supplier ─────────────────────────────────────────────────────
    const supplier = await this.supplierRepo.findById(input.supplierId);
    if (!supplier) throw new SupplierNotFoundException(input.supplierId);
    if (!supplier.isActive()) throw new SupplierNotActiveException(supplier.id, supplier.status);

    // ── Validate Decimal fields ───────────────────────────────────────────────
    let totalAmountRial: Decimal,
      weightGrams: Decimal,
      purityRatio: Decimal,
      pricePerGramRial: Decimal;
    try {
      totalAmountRial = new Decimal(input.totalAmountRial);
      weightGrams = new Decimal(input.weightGrams);
      purityRatio = new Decimal(input.purityRatio);
      pricePerGramRial = new Decimal(input.pricePerGramRial);
    } catch {
      throw new InvalidPurchaseAmountException(input.totalAmountRial);
    }
    if (totalAmountRial.lessThanOrEqualTo(0))
      throw new InvalidPurchaseAmountException(input.totalAmountRial);
    if (weightGrams.lessThanOrEqualTo(0))
      throw new InvalidPurchaseWeightException(input.weightGrams);
    if (purityRatio.lessThanOrEqualTo(0) || purityRatio.greaterThan(1))
      throw new InvalidPurchaseWeightException(input.purityRatio);

    const purchaseNumber = await this.purchaseRepo.nextPurchaseNumber();

    const purchase = await this.prisma.$transaction(async (tx) => {
      // Race-safe idempotency check inside tx
      const raceExisting = await tx.purchase.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (raceExisting) return this.purchaseRepo.mapRow(raceExisting);

      // Build items — use single item from header if no explicit items provided
      const items = input.items?.length
        ? input.items.map((it) => ({
            weightGrams: new Decimal(it.weightGrams),
            purityRatio: new Decimal(it.purityRatio),
            pricePerGramRial: new Decimal(it.pricePerGramRial),
            totalAmountRial: new Decimal(it.totalAmountRial),
            description: it.description ?? null,
          }))
        : [{ weightGrams, purityRatio, pricePerGramRial, totalAmountRial, description: null }];

      return this.purchaseRepo.createInTx(tx, {
        purchaseNumber,
        idempotencyKey: input.idempotencyKey,
        supplierId: input.supplierId,
        settlementType: input.settlementType,
        purchaseDate: input.purchaseDate,
        totalAmountRial,
        weightGrams,
        purityRatio,
        pricePerGramRial,
        supplierReference: input.supplierReference ?? null,
        notes: input.notes ?? null,
        recordedByUserId: actorUserId,
        items,
      });
    });

    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'PURCHASE_CREATED',
      entityType: 'Purchase',
      entityId: purchase.id,
      after: {
        purchaseNumber,
        supplierId: input.supplierId,
        totalAmountRial: totalAmountRial.toFixed(2),
        weightGrams: weightGrams.toFixed(6),
      },
    });

    this.logger.log(
      `[PurchaseService] Purchase created: ${purchase.id} (${purchaseNumber}) for supplier ${input.supplierId}`,
    );
    return { purchase: PurchaseResponseDto.from(purchase), wasAlreadyCreated: false };
  }

  // ─── Confirm Purchase ─────────────────────────────────────────────────────────

  /**
   * Confirms a DRAFT purchase — the main business event.
   *
   * ATOMIC TRANSACTION:
   *   1. Purchase status DRAFT → CONFIRMED
   *   2. Financial Ledger: DR FA-08 / CR FA-03 (docs/14-accounting.md)
   *   3. SupplierAccount.totalPurchasedRial += totalAmountRial
   *   4. Audit logged
   *
   * GOLD LEDGER: BLOCKED — GA-01 posting pending #22 and #39 resolution.
   *
   * Idempotency: safe to retry — duplicate confirmation returns existing state.
   */
  async confirmPurchase(purchaseId: string, actorUserId: string): Promise<PurchaseResponseDto> {
    const purchase = await this.purchaseRepo.findById(purchaseId);
    if (!purchase) throw new PurchaseNotFoundException(purchaseId);

    if (purchase.isConfirmed()) {
      this.logger.warn(
        `[PurchaseService] Purchase ${purchaseId} already CONFIRMED (idempotent call).`,
      );
      return PurchaseResponseDto.from(purchase);
    }

    if (!purchase.canTransitionTo(PurchaseStatus.CONFIRMED)) {
      throw new InvalidPurchaseTransitionException(
        purchaseId,
        purchase.status,
        PurchaseStatus.CONFIRMED,
      );
    }

    const confirmed = await this.prisma.$transaction(async (tx) => {
      // 1. Update Purchase status
      const updated = await this.purchaseRepo.confirmInTx(tx, purchaseId, actorUserId);

      // 2. Financial Ledger: DR FA-08 / CR FA-03 (atomic with purchase)
      await this.purchaseLedger.postPurchaseConfirmInTx(
        tx,
        {
          id: updated.id,
          purchaseNumber: updated.purchaseNumber,
          totalAmountRial: updated.totalAmountRial,
          weightGrams: updated.weightGrams,
          purityRatio: updated.purityRatio,
          supplierId: updated.supplierId,
        },
        actorUserId,
      );

      // 3. Update SupplierAccount balance
      await this.supplierRepo.incrementPurchasedInTx(
        tx,
        updated.supplierId,
        updated.totalAmountRial,
      );

      return updated;
    });

    // 4. Audit
    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'PURCHASE_CONFIRMED',
      entityType: 'Purchase',
      entityId: purchaseId,
      before: { status: 'DRAFT' },
      after: {
        status: 'CONFIRMED',
        totalAmountRial: confirmed.totalAmountRial.toFixed(2),
        weightGrams: confirmed.weightGrams.toFixed(6),
        ledgerPosted: 'FA-08_DR_FA-03_CR',
        goldLedgerBlocked: 'GA-01_pending_#22_#39',
      },
    });

    this.logger.log(
      `[PurchaseService] Purchase ${purchaseId} CONFIRMED — FA-08 DR / FA-03 CR posted.`,
    );
    return PurchaseResponseDto.from(confirmed);
  }

  // ─── Cancel Purchase ─────────────────────────────────────────────────────────

  async cancelPurchase(
    purchaseId: string,
    reason: string,
    actorUserId: string,
  ): Promise<PurchaseResponseDto> {
    const purchase = await this.purchaseRepo.findById(purchaseId);
    if (!purchase) throw new PurchaseNotFoundException(purchaseId);

    if (!purchase.canTransitionTo(PurchaseStatus.CANCELLED)) {
      throw new InvalidPurchaseTransitionException(
        purchaseId,
        purchase.status,
        PurchaseStatus.CANCELLED,
      );
    }

    const cancelled = await this.prisma.$transaction((tx) =>
      this.purchaseRepo.cancelInTx(tx, purchaseId, actorUserId, reason),
    );

    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'PURCHASE_CANCELLED',
      entityType: 'Purchase',
      entityId: purchaseId,
      before: { status: purchase.status },
      after: { status: 'CANCELLED', reason },
    });

    return PurchaseResponseDto.from(cancelled);
  }

  // ─── Settling / Settled — DEFERRED ───────────────────────────────────────────

  async settlePurchase(_purchaseId: string, _actorUserId: string): Promise<never> {
    throw new PurchaseSupplierSettlementDeferredException();
  }

  // ─── Read Operations ──────────────────────────────────────────────────────────

  async getPurchaseById(id: string): Promise<PurchaseResponseDto> {
    const p = await this.purchaseRepo.findById(id);
    if (!p) throw new PurchaseNotFoundException(id);
    return PurchaseResponseDto.from(p);
  }

  async listPurchases(opts: {
    supplierId?: string;
    status?: PurchaseStatus;
    limit?: number;
    offset?: number;
  }): Promise<PurchaseResponseDto[]> {
    const list = await this.purchaseRepo.findAll(opts);
    return list.map(PurchaseResponseDto.from);
  }
}
