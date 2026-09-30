import Decimal from 'decimal.js';
import { OrderStatus, CustomerType } from '@gold/shared-types';

/**
 * Order domain entity.
 *
 * State machine (architecture/STATE-MACHINES.md):
 *
 *   DRAFT → SUBMITTED (credit reserved)
 *         → CANCELLED (if in DRAFT, no credit to release)
 *   SUBMITTED → CANCELLED (credit released)
 *             → QUOTED      → ... (Phase 3.4+)
 *             → REJECTED (credit released)
 *
 * Security:
 *   - All monetary/weight fields are Decimal — BR-P05 (never Float)
 *   - State transitions are explicit; invalid transitions throw
 *   - Customers can only access their own Orders (enforced at service layer)
 *
 * docs/21-business-decisions.md §3.3, §3.4, §3.5, §4.1
 */
export class OrderEntity {
  readonly id: string;
  readonly orderNumber: string;

  readonly customerId: string;
  readonly customerAccountId: string;
  readonly pricingCalculationId: string | null;

  status: OrderStatus;

  /** Total order amount in Rial — from PricingEngineResult.finalPrice. Never Float. */
  readonly totalAmountRial: Decimal;

  /**
   * Amount reserved from CustomerAccount.reservedCreditRial.
   * 0 until status = SUBMITTED.
   * Released to 0 on CANCELLED or REJECTED.
   */
  readonly reservedAmountRial: Decimal;

  /** Weight in grams — Decimal; never Float (BR-P05) */
  readonly weightGrams: Decimal;
  /** Purity ratio e.g. 0.750 for 18K — Decimal; never Float */
  readonly purityRatio: Decimal;
  /** Customer type snapshot at Order creation time */
  readonly customerType: CustomerType | null;

  readonly submittedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly rejectedAt: Date | null;

  readonly cancellationReason: string | null;
  readonly cancelledByUserId: string | null;

  readonly rejectionReason: string | null;
  readonly rejectedByUserId: string | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: {
    id: string;
    orderNumber: string;
    customerId: string;
    customerAccountId: string;
    pricingCalculationId: string | null;
    status: OrderStatus;
    totalAmountRial: Decimal;
    reservedAmountRial: Decimal;
    weightGrams: Decimal;
    purityRatio: Decimal;
    customerType: CustomerType | null;
    submittedAt: Date | null;
    cancelledAt: Date | null;
    rejectedAt: Date | null;
    cancellationReason: string | null;
    cancelledByUserId: string | null;
    rejectionReason: string | null;
    rejectedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    Object.assign(this, props);
  }

  // ─── State machine guards ─────────────────────────────────────

  /** True if the order can transition to SUBMITTED */
  canSubmit(): boolean {
    return this.status === OrderStatus.DRAFT;
  }

  /**
   * True if the order can be cancelled.
   *
   * docs/21-business-decisions.md §4.1: Customer may cancel at any time before Trade confirmation.
   *
   * Phase 3.4 adds QUOTED:
   *   - DRAFT: no credit reserved; simple status change
   *   - SUBMITTED: credit reserved; must release credit + expire Quotation
   *   - QUOTED: credit reserved; must release credit + expire Quotation (§2.3)
   *
   * Phase 3.5+ will add ASSIGNED, UNDER_REVIEW.
   */
  canCancel(): boolean {
    return (
      this.status === OrderStatus.DRAFT ||
      this.status === OrderStatus.SUBMITTED ||
      this.status === OrderStatus.QUOTED ||
      this.status === OrderStatus.ASSIGNED || // Phase 3.5
      this.status === OrderStatus.UNDER_REVIEW || // Phase 3.5
      this.status === OrderStatus.REVISION_REQUESTED // Phase 3.5
    );
  }

  /**
   * True if the Order can be assigned to a reviewer.
   * Only QUOTED orders can be assigned (state machine: QUOTED → ASSIGNED).
   * Phase 3.5
   */
  canBeAssigned(): boolean {
    return this.status === OrderStatus.QUOTED;
  }

  /**
   * True if the Order can be approved by a reviewer.
   * Accepts both ASSIGNED and UNDER_REVIEW to allow approve from either state.
   * Phase 3.5
   */
  canApprove(): boolean {
    return this.status === OrderStatus.ASSIGNED || this.status === OrderStatus.UNDER_REVIEW;
  }

  /**
   * True if the Order can have revision requested by a reviewer.
   * Accepts both ASSIGNED and UNDER_REVIEW.
   * Phase 3.5
   */
  canRequestRevision(): boolean {
    return this.status === OrderStatus.ASSIGNED || this.status === OrderStatus.UNDER_REVIEW;
  }

  /**
   * True if credit must be released when cancelling/rejecting.
   * Credit is only reserved when status was SUBMITTED (or later).
   */
  hasCreditReserved(): boolean {
    return (
      this.status === OrderStatus.SUBMITTED ||
      this.status === OrderStatus.QUOTED ||
      this.status === OrderStatus.ASSIGNED ||
      this.status === OrderStatus.UNDER_REVIEW ||
      this.status === OrderStatus.REVISION_REQUESTED
    );
  }

  /**
   * True if the order can be rejected.
   * Staff can reject orders that are in review pipeline.
   * Phase 3.3: reject from SUBMITTED (simulated rejection for testing).
   */
  canReject(): boolean {
    return (
      this.status === OrderStatus.SUBMITTED ||
      this.status === OrderStatus.QUOTED ||
      this.status === OrderStatus.ASSIGNED ||
      this.status === OrderStatus.UNDER_REVIEW
    );
  }

  /**
   * True if a Trade can be created from this Order.
   * Only APPROVED orders are eligible for Trade creation.
   * Phase 3.6
   *
   * State machine: APPROVED → TRADE_CREATED (on confirmTrade)
   */
  canCreateTrade(): boolean {
    return this.status === OrderStatus.APPROVED;
  }
}
