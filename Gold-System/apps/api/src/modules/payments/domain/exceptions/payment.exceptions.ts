import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Payment Exceptions
 *
 * All exceptions for the payment domain.
 * Thrown by PaymentService and propagated by NestJS exception filters.
 */

/** 404 — Payment not found */
export class PaymentNotFoundException extends HttpException {
  constructor(paymentId: string) {
    super(
      { code: 'PAYMENT_NOT_FOUND', message: `Payment "${paymentId}" not found` },
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * 422 — Trade is not in a state that accepts payments.
 * Only CONFIRMED trades can accept payments.
 * docs/21-business-decisions.md §8.1 — trade must be confirmed before payment.
 */
export class TradeNotPayableException extends HttpException {
  constructor(tradeId: string, tradeStatus: string) {
    super(
      {
        code: 'TRADE_NOT_PAYABLE',
        message:
          `Trade "${tradeId}" cannot accept payments in status "${tradeStatus}". ` +
          `Only CONFIRMED trades may receive payments.`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/**
 * 404 — Trade not found.
 */
export class TradeNotFoundForPaymentException extends HttpException {
  constructor(tradeId: string) {
    super(
      { code: 'TRADE_NOT_FOUND', message: `Trade "${tradeId}" does not exist` },
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * 422 — Payment amount is invalid (zero or negative).
 * BR-P05: all amounts must be positive Decimal.
 */
export class InvalidPaymentAmountException extends HttpException {
  constructor(amount: string) {
    super(
      {
        code: 'INVALID_PAYMENT_AMOUNT',
        message: `Payment amount "${amount}" is invalid. Amount must be a positive Decimal value.`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/**
 * 409 — Allocation would exceed Trade remaining balance.
 * docs/21-business-decisions.md §8.1 — Trade cannot be settled above 100%.
 */
export class PaymentOverAllocationException extends HttpException {
  constructor(requested: string, remaining: string, tradeId: string) {
    super(
      {
        code: 'PAYMENT_OVER_ALLOCATION',
        message:
          `Cannot allocate ${requested} IRR to Trade "${tradeId}": ` +
          `only ${remaining} IRR remains. Trade cannot be settled above 100%.`,
      },
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * 409 — This payment has already been allocated to this Trade.
 * Unique constraint on (paymentId, tradeId).
 */
export class DuplicatePaymentAllocationException extends HttpException {
  constructor(paymentId: string, tradeId: string) {
    super(
      {
        code: 'DUPLICATE_PAYMENT_ALLOCATION',
        message: `Payment "${paymentId}" has already been allocated to Trade "${tradeId}".`,
      },
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * 422 — Payment state transition is invalid.
 * State machine: PENDING → VALIDATED → ALLOCATED → COMPLETED
 */
export class InvalidPaymentTransitionException extends HttpException {
  constructor(paymentId: string, from: string, to: string) {
    super(
      {
        code: 'INVALID_PAYMENT_TRANSITION',
        message: `Payment "${paymentId}" cannot transition from "${from}" to "${to}".`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/**
 * 422 — Reference number is required for this payment method.
 * Bank transfers and card-to-card payments require an external reference.
 */
export class MissingPaymentReferenceException extends HttpException {
  constructor(method: string) {
    super(
      {
        code: 'MISSING_PAYMENT_REFERENCE',
        message: `Payment method "${method}" requires a referenceNumber (bank ref or confirmation number).`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/**
 * 409 — Duplicate idempotency key (same payment submitted twice).
 * The existing payment is returned on the idempotent path.
 */
export class DuplicatePaymentException extends HttpException {
  constructor(idempotencyKey: string) {
    super(
      {
        code: 'DUPLICATE_PAYMENT',
        message: `A payment with idempotency key "${idempotencyKey}" already exists.`,
      },
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * 422 — Payment is not in the VALIDATED status required for allocation.
 */
export class PaymentNotValidatedException extends HttpException {
  constructor(paymentId: string, currentStatus: string) {
    super(
      {
        code: 'PAYMENT_NOT_VALIDATED',
        message: `Payment "${paymentId}" must be VALIDATED before allocation (current: "${currentStatus}").`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
