import { BusinessRuleException } from '../../../../common/exceptions/business-rule.exception';

/**
 * Thrown when a Quotation is not found, or when a customer tries to access
 * another customer's Quotation (returns 404, not 403, to prevent enumeration).
 */
export class QuotationNotFoundException extends BusinessRuleException {
  constructor(quotationId: string) {
    super('QUOTATION_NOT_FOUND', `Quotation '${quotationId}' not found.`, { quotationId });
  }
}

/**
 * Thrown when a state transition is attempted on a Quotation that is not in
 * the correct state for that transition.
 */
export class InvalidQuotationStateTransitionException extends BusinessRuleException {
  constructor(currentStatus: string, attemptedAction: string) {
    super(
      'QUOTATION_INVALID_STATE_TRANSITION',
      `Cannot perform '${attemptedAction}' on a quotation with status '${currentStatus}'.`,
      { currentStatus, attemptedAction },
    );
  }
}

/**
 * Thrown when an attempt is made to generate a second Quotation (version 1)
 * for an Order that already has one.
 * Prevents duplicate quotation generation — §2 (one initial quotation per Order).
 */
export class DuplicateQuotationException extends BusinessRuleException {
  constructor(orderId: string) {
    super(
      'QUOTATION_DUPLICATE',
      `A quotation already exists for order '${orderId}'. Duplicate generation is not permitted.`,
      { orderId },
    );
  }
}

/**
 * Thrown when the Quotation document has not been generated yet
 * and the download is requested.
 */
export class QuotationDocumentNotReadyException extends BusinessRuleException {
  constructor(quotationId: string) {
    super(
      'QUOTATION_DOCUMENT_NOT_READY',
      `The document for quotation '${quotationId}' has not been generated yet. Please try again shortly.`,
      { quotationId },
    );
  }
}
