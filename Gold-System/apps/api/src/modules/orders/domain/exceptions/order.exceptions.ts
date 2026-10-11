import { BusinessRuleException } from '../../../../common/exceptions/business-rule.exception';
import Decimal from 'decimal.js';

/**
 * Thrown when an Order's required credit exceeds the customer's available credit.
 *
 * docs/21-business-decisions.md §3.4 — Hard Block; no override permitted.
 * The system rejects the Order immediately. No manager override is possible.
 */
export class InsufficientCreditException extends BusinessRuleException {
  constructor(available: Decimal, required: Decimal) {
    super(
      'ORDER_INSUFFICIENT_CREDIT',
      'Insufficient available credit to submit this order. ' +
        'Please reduce the order quantity or contact your account manager for a credit top-up.',
      {
        availableRial: available.toFixed(2),
        requiredRial: required.toFixed(2),
        shortfallRial: required.minus(available).toFixed(2),
      },
    );
  }
}

/**
 * Thrown when a sell order's weight exceeds the customer's booked gold holding.
 * Buy orders use rial credit; sell orders use melted-gold weight.
 */
export class InsufficientGoldException extends BusinessRuleException {
  constructor(available: Decimal, required: Decimal) {
    super(
      'ORDER_INSUFFICIENT_GOLD',
      'Insufficient gold weight to submit this sell order. ' +
        'Reduce the weight or wait until a pending sale is cancelled.',
      {
        availableGrams: available.toFixed(6),
        requiredGrams: required.toFixed(6),
        shortfallGrams: required.minus(available).toFixed(6),
      },
    );
  }
}

/**
 * Thrown when a state transition is attempted on an Order that is not in
 * the correct state for that transition.
 */
export class InvalidOrderStateTransitionException extends BusinessRuleException {
  constructor(currentStatus: string, attemptedAction: string) {
    super(
      'ORDER_INVALID_STATE_TRANSITION',
      `Cannot perform '${attemptedAction}' on an order with status '${currentStatus}'.`,
      { currentStatus, attemptedAction },
    );
  }
}

/**
 * Thrown when a customer attempts to cancel an order but the store
 * has customer cancellation disabled (§4.1).
 */
export class CustomerCancellationDisabledException extends BusinessRuleException {
  constructor() {
    super(
      'ORDER_CUSTOMER_CANCELLATION_DISABLED',
      'Customer-initiated cancellation is not permitted for this store. ' +
        'Please contact the store operator to cancel your order.',
    );
  }
}

/**
 * Thrown when a customer attempts to access another customer's order.
 * Enforces customer isolation — customers must never see each other's data.
 */
export class OrderAccessDeniedException extends BusinessRuleException {
  constructor() {
    super('ORDER_ACCESS_DENIED', 'You do not have permission to access this order.');
  }
}

/**
 * Thrown when an order is not found.
 */
export class OrderNotFoundException extends BusinessRuleException {
  constructor(orderId: string) {
    super('ORDER_NOT_FOUND', `Order '${orderId}' not found.`, { orderId });
  }
}

/**
 * Thrown when a customer without an approved KYC tries to place an order.
 * Customers must complete KYC before placing orders.
 */
export class CustomerNotEligibleForOrderException extends BusinessRuleException {
  constructor(reason: string) {
    super('ORDER_CUSTOMER_NOT_ELIGIBLE', reason);
  }
}
