import { BusinessRuleException } from '../../../../common/exceptions/business-rule.exception';

/**
 * Thrown when the external price provider cannot be reached.
 * HTTP 503 is appropriate — upstream failure.
 */
export class PriceProviderUnavailableError extends BusinessRuleException {
  constructor(providerName: string, cause?: string) {
    super(
      'PRICE_PROVIDER_UNAVAILABLE',
      `Price provider "${providerName}" is currently unavailable.${cause ? ` Cause: ${cause}` : ''}`,
    );
  }
}

/**
 * Thrown when the provider returns a malformed or unexpected response.
 */
export class InvalidPriceResponseError extends BusinessRuleException {
  constructor(providerName: string, detail: string) {
    super(
      'INVALID_PRICE_RESPONSE',
      `Provider "${providerName}" returned an invalid response: ${detail}`,
    );
  }
}

/**
 * Thrown when the PriceSnapshot is too old (beyond configured TTL).
 * docs/12-pricing-engine.md — staleness check requirement.
 */
export class StalePriceError extends BusinessRuleException {
  constructor(snapshotId: string, ageSeconds: number, ttlSeconds: number) {
    super(
      'STALE_PRICE_SNAPSHOT',
      `PriceSnapshot ${snapshotId} is ${ageSeconds}s old, exceeding TTL of ${ttlSeconds}s. Refresh the price before recalculating.`,
    );
  }
}

/**
 * Thrown when no valid PriceSnapshot exists in the system.
 */
export class NoPriceAvailableError extends BusinessRuleException {
  constructor() {
    super(
      'NO_PRICE_AVAILABLE',
      'No valid price snapshot is available. The price provider must be polled first.',
    );
  }
}

/**
 * Thrown when an invalid weight is supplied.
 * Weight must be positive and finite.
 */
export class InvalidWeightError extends BusinessRuleException {
  constructor(weight: string) {
    super(
      'INVALID_WEIGHT',
      `Weight "${weight}" is invalid. Must be a positive finite number in grams.`,
    );
  }
}

/**
 * Thrown when an unsupported purity is supplied.
 * Purity must be in range (0, 1].
 */
export class InvalidPurityError extends BusinessRuleException {
  constructor(purity: string) {
    super(
      'INVALID_PURITY',
      `Purity ratio "${purity}" is invalid. Must be in range (0, 1]. e.g. 0.750 for 18K gold.`,
    );
  }
}

/**
 * Thrown when the supplied CustomerType has no matching active PricingRule
 * and no default (null-type) rule exists.
 */
export class MissingPricingRuleError extends BusinessRuleException {
  constructor(customerType: string | null) {
    super(
      'MISSING_PRICING_RULE',
      customerType
        ? `No active PricingRule found for CustomerType "${customerType}". Store Manager must configure a pricing rule.`
        : 'No active default PricingRule found. Store Manager must configure at least one pricing rule.',
    );
  }
}

/**
 * Thrown when the pricing configuration is incomplete and
 * a required parameter is not set.
 */
export class MissingPricingConfigError extends BusinessRuleException {
  constructor(paramName: string) {
    super(
      'MISSING_PRICING_CONFIG',
      `Required pricing configuration "${paramName}" is not set. Store Manager must configure it before orders can be priced.`,
    );
  }
}
