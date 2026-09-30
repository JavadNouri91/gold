import Decimal from 'decimal.js';
import {
  PurchaseStatus,
  PurchaseSettlementType,
  VALID_PURCHASE_TRANSITIONS,
} from '../constants/purchase-states';

/**
 * Purchase Entity
 *
 * Domain entity for an upstream gold purchase.
 * Manual entry in MVP (docs/21-business-decisions.md §11.2).
 *
 * FINANCIAL LEDGER (when CONFIRMED):
 *   DR FA-08 (Purchase Cost) / CR FA-03 (Supplier Payable)
 *   Source: docs/14-accounting.md + §6.1 account descriptions
 *
 * GOLD LEDGER — BLOCKED:
 *   GA-01 IN — open-questions.md #22 and #39 OPEN
 */
export class PurchaseEntity {
  readonly id: string;
  readonly purchaseNumber: string;
  readonly idempotencyKey: string;
  readonly supplierId: string;
  readonly status: PurchaseStatus;
  readonly settlementType: PurchaseSettlementType;
  readonly purchaseDate: Date;
  readonly totalAmountRial: Decimal;
  readonly weightGrams: Decimal;
  readonly purityRatio: Decimal;
  readonly pricePerGramRial: Decimal;
  readonly supplierReference: string | null;
  readonly notes: string | null;
  readonly recordedByUserId: string | null;
  readonly confirmedByUserId: string | null;
  readonly confirmedAt: Date | null;
  readonly cancelledByUserId: string | null;
  readonly cancelledAt: Date | null;
  readonly cancellationReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(data: {
    id: string;
    purchaseNumber: string;
    idempotencyKey: string;
    supplierId: string;
    status: PurchaseStatus;
    settlementType: PurchaseSettlementType;
    purchaseDate: Date;
    totalAmountRial: Decimal;
    weightGrams: Decimal;
    purityRatio: Decimal;
    pricePerGramRial: Decimal;
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
  }) {
    this.id = data.id;
    this.purchaseNumber = data.purchaseNumber;
    this.idempotencyKey = data.idempotencyKey;
    this.supplierId = data.supplierId;
    this.status = data.status;
    this.settlementType = data.settlementType;
    this.purchaseDate = data.purchaseDate;
    this.totalAmountRial = new Decimal(data.totalAmountRial.toString());
    this.weightGrams = new Decimal(data.weightGrams.toString());
    this.purityRatio = new Decimal(data.purityRatio.toString());
    this.pricePerGramRial = new Decimal(data.pricePerGramRial.toString());
    this.supplierReference = data.supplierReference;
    this.notes = data.notes;
    this.recordedByUserId = data.recordedByUserId;
    this.confirmedByUserId = data.confirmedByUserId;
    this.confirmedAt = data.confirmedAt;
    this.cancelledByUserId = data.cancelledByUserId;
    this.cancelledAt = data.cancelledAt;
    this.cancellationReason = data.cancellationReason;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  canTransitionTo(next: PurchaseStatus): boolean {
    return VALID_PURCHASE_TRANSITIONS[this.status].includes(next);
  }

  isDraft(): boolean {
    return this.status === PurchaseStatus.DRAFT;
  }
  isConfirmed(): boolean {
    return this.status === PurchaseStatus.CONFIRMED;
  }
  isCancelled(): boolean {
    return this.status === PurchaseStatus.CANCELLED;
  }
}

export class PurchaseItemEntity {
  readonly id: string;
  readonly purchaseId: string;
  readonly weightGrams: Decimal;
  readonly purityRatio: Decimal;
  readonly pricePerGramRial: Decimal;
  readonly totalAmountRial: Decimal;
  readonly description: string | null;
  readonly createdAt: Date;

  constructor(data: {
    id: string;
    purchaseId: string;
    weightGrams: Decimal;
    purityRatio: Decimal;
    pricePerGramRial: Decimal;
    totalAmountRial: Decimal;
    description: string | null;
    createdAt: Date;
  }) {
    this.id = data.id;
    this.purchaseId = data.purchaseId;
    this.weightGrams = new Decimal(data.weightGrams.toString());
    this.purityRatio = new Decimal(data.purityRatio.toString());
    this.pricePerGramRial = new Decimal(data.pricePerGramRial.toString());
    this.totalAmountRial = new Decimal(data.totalAmountRial.toString());
    this.description = data.description;
    this.createdAt = data.createdAt;
  }
}
