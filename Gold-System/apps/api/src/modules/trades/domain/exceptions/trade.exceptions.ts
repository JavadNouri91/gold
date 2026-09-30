import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';

/**
 * Trade-domain exceptions — Phase 3.6
 */

/** Raised when a Trade is not found by ID (404 — prevents enumeration) */
export class TradeNotFoundException extends NotFoundException {
  constructor(tradeId: string) {
    super(`Trade not found: ${tradeId}`);
  }
}

/**
 * Raised when a Trade already exists for the given Order.
 * Prevents duplicate Trade creation in concurrent confirmation attempts.
 */
export class DuplicateTradeException extends ConflictException {
  constructor(orderId: string) {
    super(`A Trade already exists for Order ${orderId}`);
  }
}

/**
 * Raised when an Order is not eligible to have a Trade created from it.
 * Only APPROVED orders may be confirmed into Trades.
 */
export class OrderNotEligibleForTradeException extends ConflictException {
  constructor(orderId: string, currentStatus: string) {
    super(
      `Order ${orderId} is not eligible for Trade creation. ` +
        `Expected status APPROVED but found ${currentStatus}`,
    );
  }
}

/**
 * Raised when a Trade transition is invalid.
 * E.g. attempting to reverse an already-reversed or settled Trade.
 */
export class InvalidTradeStateTransitionException extends ConflictException {
  constructor(currentStatus: string, action: string) {
    super(`Cannot perform '${action}' on Trade in status '${currentStatus}'`);
  }
}

/**
 * Raised when no active (ACTIVE) Quotation exists for the Order at confirmation time.
 * An ACTIVE quotation is required to lock trade terms.
 */
export class NoActiveQuotationForTradeException extends ConflictException {
  constructor(orderId: string) {
    super(
      `No active Quotation found for Order ${orderId}. ` +
        'An ACTIVE quotation is required to confirm a Trade.',
    );
  }
}

/**
 * Raised when reversal reason is missing or too short.
 * §4.2 requires a documented reason for Trade reversal.
 */
export class TradeReversalReasonRequiredException extends BadRequestException {
  constructor() {
    super('A documented reason is required for Trade reversal (§4.2)');
  }
}
