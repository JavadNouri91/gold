import Decimal from 'decimal.js';
import {
  PaymentMethod,
  PaymentStatus,
  VALID_PAYMENT_TRANSITIONS,
} from '../constants/payment-methods';

/**
 * Payment Entity
 *
 * Domain entity for a single customer payment against a confirmed Trade.
 * Encapsulates state machine logic per architecture/STATE-MACHINES.md.
 *
 * State: PENDING → VALIDATED → ALLOCATED → COMPLETED
 *         ↘ FAILED (from PENDING or VALIDATED)
 *         ↘ REVERSED (from ALLOCATED or COMPLETED)
 */
export class PaymentEntity {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly tradeId: string;
  readonly customerId: string;
  readonly method: PaymentMethod;
  readonly amount: Decimal;
  readonly currency: string;
  readonly status: PaymentStatus;
  readonly referenceNumber: string | null;
  readonly receiptKey: string | null;
  readonly receiptMimeType: string | null;
  readonly receiptFileName: string | null;
  readonly notes: string | null;
  readonly receivedAt: Date | null;
  readonly recordedByUserId: string | null;
  readonly validatedAt: Date | null;
  readonly validatedByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(data: {
    id: string;
    idempotencyKey: string;
    tradeId: string;
    customerId: string;
    method: PaymentMethod;
    amount: Decimal;
    currency: string;
    status: PaymentStatus;
    referenceNumber: string | null;
    receiptKey?: string | null;
    receiptMimeType?: string | null;
    receiptFileName?: string | null;
    notes: string | null;
    receivedAt: Date | null;
    recordedByUserId: string | null;
    validatedAt: Date | null;
    validatedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = data.id;
    this.idempotencyKey = data.idempotencyKey;
    this.tradeId = data.tradeId;
    this.customerId = data.customerId;
    this.method = data.method;
    this.amount = new Decimal(data.amount.toString());
    this.currency = data.currency;
    this.status = data.status;
    this.referenceNumber = data.referenceNumber;
    this.receiptKey = data.receiptKey ?? null;
    this.receiptMimeType = data.receiptMimeType ?? null;
    this.receiptFileName = data.receiptFileName ?? null;
    this.notes = data.notes;
    this.receivedAt = data.receivedAt;
    this.recordedByUserId = data.recordedByUserId;
    this.validatedAt = data.validatedAt;
    this.validatedByUserId = data.validatedByUserId;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  /** Returns true if this transition is valid per the state machine. */
  canTransitionTo(nextStatus: PaymentStatus): boolean {
    const allowed = VALID_PAYMENT_TRANSITIONS[this.status];
    return allowed.includes(nextStatus);
  }

  isPending(): boolean {
    return this.status === PaymentStatus.PENDING;
  }

  isValidated(): boolean {
    return this.status === PaymentStatus.VALIDATED;
  }

  isAllocated(): boolean {
    return this.status === PaymentStatus.ALLOCATED;
  }

  isCompleted(): boolean {
    return this.status === PaymentStatus.COMPLETED;
  }

  isReversed(): boolean {
    return this.status === PaymentStatus.REVERSED;
  }

  isActive(): boolean {
    return ![PaymentStatus.FAILED, PaymentStatus.REVERSED].includes(this.status);
  }
}

/**
 * PaymentAllocation Entity
 *
 * Links a Payment to a Trade and records the amount allocated.
 * Write-once per BR-L02 principle.
 */
export class PaymentAllocationEntity {
  readonly id: string;
  readonly paymentId: string;
  readonly tradeId: string;
  readonly amount: Decimal;
  readonly allocatedByUserId: string | null;
  readonly allocatedAt: Date;

  constructor(data: {
    id: string;
    paymentId: string;
    tradeId: string;
    amount: Decimal;
    allocatedByUserId: string | null;
    allocatedAt: Date;
  }) {
    this.id = data.id;
    this.paymentId = data.paymentId;
    this.tradeId = data.tradeId;
    this.amount = new Decimal(data.amount.toString());
    this.allocatedByUserId = data.allocatedByUserId;
    this.allocatedAt = data.allocatedAt;
  }
}
