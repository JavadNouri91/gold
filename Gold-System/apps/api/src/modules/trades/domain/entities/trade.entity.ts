import Decimal from 'decimal.js';
import { TradeStatus } from '@gold/shared-types';
import { TradeItemEntity } from './trade-item.entity';

/**
 * Trade Entity — Phase 3.6
 *
 * Represents the confirmed trade between the gold dealer and a customer.
 *
 * IMMUTABILITY (BR-T02, BR-P03, BR-P07):
 *   All financial fields are set at creation and NEVER updated.
 *   Corrections require the REVERSED mechanism (§4.2).
 *
 * STATE MACHINE:
 *   CONFIRMED → REVERSED (§4.2, Manager authorization required)
 *   CONFIRMED → SETTLING (Phase 4 — DEFERRED)
 *   SETTLING  → COMPLETED (Phase 4 — DEFERRED)
 *
 * BLOCKED (§13.4): Dual-approval flow (PENDING_CONFIRMATION → CONFIRMED)
 *   deferred because second approver role threshold is undefined.
 */
export class TradeEntity {
  readonly id: string;

  /** Human-readable identifier, e.g. TRD-000001 */
  readonly tradeNumber: string;

  // Source references — immutable after creation
  readonly orderId: string;
  readonly quotationId: string;
  readonly customerId: string;
  readonly pricingCalculationId: string;

  /** Current state. Only status transitions are permitted; financial fields stay frozen. */
  status: TradeStatus;

  // ── IMMUTABLE commercial terms ─────────────────────────────────────────
  // These are snapshotted at confirmation from the locked Quotation.
  // NEVER update after creation. §4.2 reversal + new Trade for corrections.

  readonly totalAmountRial: Decimal;
  readonly weightGrams: Decimal;
  readonly purityRatio: Decimal;
  readonly unitPriceRial: Decimal;
  readonly step1BasePrice: Decimal | null;
  readonly wageAmount: Decimal | null;

  /** null while profit calculation is BLOCKED (§13.2) */
  readonly profitAmount: Decimal | null;

  /** null while tax calculation is BLOCKED (§13.3) */
  readonly taxAmount: Decimal | null;

  readonly discountAmount: Decimal | null;
  readonly roundingAmount: Decimal | null;

  /** false while profit/tax are BLOCKED; true when all pricing steps resolved */
  readonly isComplete: boolean;

  /** Snapshot of customer classification at confirmation time */
  readonly customerType: string | null;

  /** Full locked snapshot for Phase 4 accounting integration reference */
  readonly lockedTermsSnapshot: Record<string, unknown>;

  // ── Confirmation tracking ──────────────────────────────────────────────
  readonly confirmedByUserId: string;
  readonly confirmedAt: Date;

  // ── Reversal tracking (§4.2) ──────────────────────────────────────────
  readonly reversedByUserId: string | null;
  readonly reversedAt: Date | null;
  readonly reversalReason: string | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;

  /** Line-item snapshots (eagerly loaded) */
  items: TradeItemEntity[];

  constructor(params: {
    id: string;
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
    reversedByUserId: string | null;
    reversedAt: Date | null;
    reversalReason: string | null;
    createdAt: Date;
    updatedAt: Date;
    items: TradeItemEntity[];
  }) {
    this.id = params.id;
    this.tradeNumber = params.tradeNumber;
    this.orderId = params.orderId;
    this.quotationId = params.quotationId;
    this.customerId = params.customerId;
    this.pricingCalculationId = params.pricingCalculationId;
    this.status = params.status;
    this.totalAmountRial = params.totalAmountRial;
    this.weightGrams = params.weightGrams;
    this.purityRatio = params.purityRatio;
    this.unitPriceRial = params.unitPriceRial;
    this.step1BasePrice = params.step1BasePrice;
    this.wageAmount = params.wageAmount;
    this.profitAmount = params.profitAmount;
    this.taxAmount = params.taxAmount;
    this.discountAmount = params.discountAmount;
    this.roundingAmount = params.roundingAmount;
    this.isComplete = params.isComplete;
    this.customerType = params.customerType;
    this.lockedTermsSnapshot = params.lockedTermsSnapshot;
    this.confirmedByUserId = params.confirmedByUserId;
    this.confirmedAt = params.confirmedAt;
    this.reversedByUserId = params.reversedByUserId;
    this.reversedAt = params.reversedAt;
    this.reversalReason = params.reversalReason;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
    this.items = params.items;
  }

  // ── State machine guards ───────────────────────────────────────────────

  /**
   * Guard: can this Trade be reversed?
   * §4.2: Reversal is only permitted on CONFIRMED trades.
   * Financial/Gold Ledger reversal handled in Phase 4.
   */
  canReverse(): boolean {
    return this.status === TradeStatus.CONFIRMED;
  }

  /**
   * Guard: is the Trade in a terminal state?
   * Terminal trades cannot transition further (without Phase 4 settlement).
   */
  isTerminal(): boolean {
    return (
      this.status === TradeStatus.REVERSED ||
      this.status === TradeStatus.COMPLETED ||
      this.status === TradeStatus.CANCELLED
    );
  }
}
