/**
 * Payment Domain Constants
 *
 * Supported payment methods per docs/21-business-decisions.md §9.1
 *
 * SUPPORTED (MVP):
 *   BANK_TRANSFER  — حواله بانکی
 *   CARD_TO_CARD   — کارت به کارت
 *   CASH           — نقد
 *
 * NOT SUPPORTED (Future):
 *   Online Payment Gateway — DEFERRED §13.7 — provider not selected
 *
 * Architecture requirement (§9.1): Payment method field is an enum.
 * Documents (receipt, reference) are attached via Attachment entity.
 */

export enum PaymentMethod {
  BANK_TRANSFER = 'BANK_TRANSFER',
  CARD_TO_CARD = 'CARD_TO_CARD',
  CASH = 'CASH',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  VALIDATED = 'VALIDATED',
  ALLOCATED = 'ALLOCATED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
}

export enum SettlementStatus {
  PENDING = 'PENDING',
  SETTLED = 'SETTLED',
}

export interface PaymentMethodDefinition {
  method: PaymentMethod;
  nameFa: string;
  requiresReference: boolean; // whether referenceNumber is required
}

export const PAYMENT_METHOD_DEFINITIONS: Record<PaymentMethod, PaymentMethodDefinition> = {
  [PaymentMethod.BANK_TRANSFER]: {
    method: PaymentMethod.BANK_TRANSFER,
    nameFa: 'حواله بانکی',
    requiresReference: true, // bank reference/tracking number required
  },
  [PaymentMethod.CARD_TO_CARD]: {
    method: PaymentMethod.CARD_TO_CARD,
    nameFa: 'کارت به کارت',
    requiresReference: true, // transfer confirmation required
  },
  [PaymentMethod.CASH]: {
    method: PaymentMethod.CASH,
    nameFa: 'نقد',
    requiresReference: false, // no external reference for cash
  },
};

/**
 * State machine transitions for Payment.
 * Source: architecture/STATE-MACHINES.md
 */
export const VALID_PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.PENDING]: [PaymentStatus.VALIDATED, PaymentStatus.FAILED],
  [PaymentStatus.VALIDATED]: [PaymentStatus.ALLOCATED, PaymentStatus.FAILED],
  [PaymentStatus.ALLOCATED]: [PaymentStatus.COMPLETED, PaymentStatus.REVERSED],
  [PaymentStatus.COMPLETED]: [PaymentStatus.REVERSED],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.REVERSED]: [],
};
