import { PaymentMethod } from '../../domain/constants/payment-methods';

/**
 * Record Payment DTO
 *
 * Input for recording a new payment against a confirmed Trade.
 * docs/21-business-decisions.md §9.1
 */
export class RecordPaymentDto {
  /** Unique key per submission — prevents duplicate payment records. */
  idempotencyKey: string;

  /** ID of the confirmed Trade this payment is for. */
  tradeId: string;

  /**
   * Payment method.
   * Supported MVP methods: BANK_TRANSFER, CARD_TO_CARD, CASH (§9.1).
   * Online gateway: DEFERRED (§13.7).
   */
  method: PaymentMethod;

  /** Payment amount in IRR (Rial). Must be positive. BR-P05: Decimal only. */
  amount: string; // string input — converted to Decimal in service

  /** External bank reference or transfer confirmation number.
   * Required for BANK_TRANSFER and CARD_TO_CARD. */
  referenceNumber?: string;

  /** Accountant notes. */
  notes?: string;

  /** When the physical payment was received (ISO 8601). */
  receivedAt?: string;
}

/**
 * Allocate Payment DTO
 *
 * Input for allocating a validated payment to a Trade.
 */
export class AllocatePaymentDto {
  /** Trade ID to allocate this payment to. */
  tradeId: string;

  /** Amount to allocate (must be > 0 and <= remaining Trade balance). */
  amount: string; // Decimal string
}

/**
 * Validate Payment DTO
 *
 * Input for marking a PENDING payment as VALIDATED (accountant confirmation).
 */
export class ValidatePaymentDto {
  /** Optional note from accountant. */
  notes?: string;
}
