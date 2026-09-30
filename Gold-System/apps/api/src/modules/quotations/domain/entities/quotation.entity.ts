import Decimal from 'decimal.js';
import { QuotationStatus } from '@gold/shared-types';
import { QuotationItemEntity } from './quotation-item.entity';

/**
 * Quotation domain entity.
 *
 * IMMUTABILITY: Financial values are set at creation and NEVER modified.
 *   - Price is locked at Order submission (§2.1)
 *   - Gold price changes after lock do NOT affect this Quotation (§2.2)
 *   - BR-P03: all effective prices are snapshotted
 *   - BR-P07: final price must be reproducible
 *
 * STATE MACHINE (architecture/STATE-MACHINES.md):
 *   ACTIVE → EXPIRED    (Order cancelled — §2.3; NOT time-based)
 *   ACTIVE → REVISED    (Revision requested — Phase 3.5+)
 *   ACTIVE → CONVERTED  (Trade approved — Phase 3.5+)
 *
 * QUOTATION vs TRADE:
 *   BR-O03: Quotation is NOT a Trade confirmation.
 *   Quotation represents the commercial terms; the Trade is the confirmed deal.
 *
 * All monetary/weight fields are Decimal — BR-P05 (never Float).
 */
export class QuotationEntity {
  readonly id: string;
  readonly quotationNumber: string;

  readonly orderId: string;
  readonly customerId: string;
  readonly pricingCalculationId: string;

  readonly version: number;
  status: QuotationStatus;

  // ── Financial snapshot — immutable once set ───────────────────
  readonly totalAmountRial: Decimal;
  readonly weightGrams: Decimal;
  readonly purityRatio: Decimal;

  /** Step 1 base price per gram — from PricingCalculation */
  readonly step1BasePrice: Decimal | null;
  /** Wage amount — 0 for molten gold in MVP (§1.6) */
  readonly wageAmount: Decimal | null;
  /** Discount amount applied — §1.3 */
  readonly discountAmount: Decimal | null;
  /** Rounding delta applied — §1.7 */
  readonly roundingAmount: Decimal | null;

  /**
   * false while profit (§13.2) and tax (§13.3) decisions are OPEN.
   * The totalAmountRial excludes profit and tax until those are resolved.
   */
  readonly isComplete: boolean;

  // ── Document ──────────────────────────────────────────────────
  /** S3/MinIO object key — null if document generation has not completed */
  readonly documentKey: string | null;
  readonly documentMimeType: string | null;
  readonly documentGeneratedAt: Date | null;

  readonly generatedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  /**
   * Line-item snapshots (eagerly loaded when using findById/findByOrderId).
   * Empty array when loaded via toDomainBase (no items included in query).
   */
  readonly items: QuotationItemEntity[];

  constructor(props: {
    id: string;
    quotationNumber: string;
    orderId: string;
    customerId: string;
    pricingCalculationId: string;
    version: number;
    status: QuotationStatus;
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
    generatedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    /** Eager-loaded line items — defaults to [] if not provided */
    items?: QuotationItemEntity[];
  }) {
    Object.assign(this, props);
    this.items = props.items ?? [];
  }

  // ─── State machine guards ─────────────────────────────────────

  /** True if the Quotation is in a state that can be expired (Order cancelled) */
  canExpire(): boolean {
    return this.status === QuotationStatus.ACTIVE;
  }

  /** True if the Quotation has a generated document */
  hasDocument(): boolean {
    return this.documentKey !== null;
  }
}
