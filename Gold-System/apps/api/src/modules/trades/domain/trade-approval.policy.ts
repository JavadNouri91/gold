import Decimal from 'decimal.js';

/**
 * How many distinct approvals a Trade needs before it is final.
 *
 * MVP: one reviewer with `trade.approve` is enough (`requiredCount` defaults to 1).
 * Later (§5.2): set `dualApprovalThresholdRial` and/or raise `requiredCount`.
 * The Order still goes APPROVED first; `confirmTrade` stays the finalizer.
 */
export type TradeApprovalPolicyInput = {
  /** Approvals already counted, including the one just recorded. */
  recordedCount: number;
  /** Base requirement. Default 1 (single-person MVP). */
  requiredCount?: number;
  amountRial?: Decimal;
  /**
   * When set, orders at/above this amount need extra approvals.
   * Null/undefined = threshold not configured (OPEN §13.4).
   */
  dualApprovalThresholdRial?: Decimal | null;
  /** Extra people required when the amount hits the threshold. Default 1 (total 2). */
  extraApprovalsWhenOverThreshold?: number;
};

export type TradeApprovalDecision = {
  requiredCount: number;
  recordedCount: number;
  isFinal: boolean;
};

export function requiredTradeApprovals(input: TradeApprovalPolicyInput): number {
  const base = Math.max(1, input.requiredCount ?? 1);
  const threshold = input.dualApprovalThresholdRial;
  if (
    threshold &&
    input.amountRial &&
    !threshold.lte(0) &&
    input.amountRial.greaterThanOrEqualTo(threshold)
  ) {
    return base + Math.max(1, input.extraApprovalsWhenOverThreshold ?? 1);
  }
  return base;
}

export function evaluateTradeApproval(input: TradeApprovalPolicyInput): TradeApprovalDecision {
  const requiredCount = requiredTradeApprovals(input);
  const recordedCount = Math.max(0, input.recordedCount);
  return {
    requiredCount,
    recordedCount,
    isFinal: recordedCount >= requiredCount,
  };
}
