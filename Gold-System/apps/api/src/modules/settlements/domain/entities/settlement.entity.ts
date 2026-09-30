import Decimal from 'decimal.js';
import { SettlementStatus } from '../../../payments/domain/constants/payment-methods';

/**
 * Settlement Entity
 *
 * Domain entity for Trade settlement status.
 * One settlement record per Trade.
 *
 * Status: PENDING → SETTLED
 * §8.1: SETTLED when total allocated payments >= Trade total.
 * §8.2: Full payment required in a single transaction (no installments).
 */
export class SettlementEntity {
  readonly id: string;
  readonly tradeId: string;
  readonly status: SettlementStatus;
  readonly settledAmount: Decimal;
  readonly settledAt: Date | null;
  readonly settledByUserId: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(data: {
    id: string;
    tradeId: string;
    status: SettlementStatus;
    settledAmount: Decimal;
    settledAt: Date | null;
    settledByUserId: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = data.id;
    this.tradeId = data.tradeId;
    this.status = data.status;
    this.settledAmount = new Decimal(data.settledAmount.toString());
    this.settledAt = data.settledAt;
    this.settledByUserId = data.settledByUserId;
    this.notes = data.notes;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  isSettled(): boolean {
    return this.status === SettlementStatus.SETTLED;
  }

  isPending(): boolean {
    return this.status === SettlementStatus.PENDING;
  }

  /**
   * Computes remaining balance given Trade total.
   * Uses Decimal arithmetic — BR-P05 (never Float).
   */
  remainingBalance(tradeTotal: Decimal): Decimal {
    return tradeTotal.minus(this.settledAmount);
  }

  /**
   * Returns true if the settlement amount covers 100% of the Trade total.
   * §8.1: A Trade is fully settled when 100% of Trade total has been paid.
   */
  isFullyPaid(tradeTotal: Decimal): boolean {
    return this.settledAmount.greaterThanOrEqualTo(tradeTotal);
  }
}
