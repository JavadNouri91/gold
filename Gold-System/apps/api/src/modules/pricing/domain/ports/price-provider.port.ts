import Decimal from 'decimal.js';

/**
 * Raw price data as returned by the external provider, BEFORE normalization.
 *
 * Unit / purity context is OPEN — §13.1 of docs/21-business-decisions.md.
 * A concrete provider adapter must populate these fields correctly once
 * the provider is selected.
 */
export interface RawPriceData {
  /** Exact numeric value returned by the provider (before any conversion) */
  rawValue: Decimal;
  /** Unit description as reported by provider — e.g. "IRR_PER_GRAM_999" */
  unit: string;
  /** Purity reference as reported by provider — e.g. "999", "750" */
  purityReference: string | null;
  /** ISO 4217 currency code — e.g. "IRR" */
  currency: string;
  /** When the provider generated this price tick */
  capturedAt: Date;
  /** Provider's unique identifier for this price tick (for idempotency) */
  externalRef: string | null;
  /** Any additional metadata from the provider response */
  metadata: Record<string, unknown> | null;
}

export type MarketStatus = 'OPEN' | 'CLOSED' | 'SUSPENDED' | 'UNKNOWN';

/**
 * Port interface for external price data providers.
 *
 * docs/15-api-integrations.md §15.1 — Provider code must NOT leak into
 * domain or application layers. Implement this interface for each provider.
 *
 * Requirements:
 *  - Timeout handling (provider must respect timeout config)
 *  - Circuit breaker / availability checking
 *  - No provider-specific code in callers
 */
export interface PriceProviderPort {
  /**
   * Fetch the current gold price from the external source.
   * Throws PriceProviderUnavailableError when the provider cannot be reached.
   * Throws InvalidPriceResponseError when the response is malformed.
   */
  getLatestPrice(): Promise<RawPriceData>;

  /**
   * Return the current market status.
   * Returns UNKNOWN if the provider does not expose market status.
   */
  getMarketStatus(): Promise<MarketStatus>;

  /** Human-readable name for logging and error reporting */
  readonly providerName: string;
}

export const PRICE_PROVIDER_TOKEN = Symbol('PRICE_PROVIDER_PORT');

/**
 * Port interface for price normalization.
 *
 * §1.5 of docs/21-business-decisions.md:
 * The Pricing Engine uses a canonical internal unit: Rial per gram of
 * reference purity. The concrete normalizer converts raw API values to
 * this unit. The canonical unit and purity are set per-provider.
 *
 * STATUS: Mock normalizer available for development.
 * Real normalizer requires §13.1 resolution (provider selection).
 */
export interface PriceNormalizerPort {
  /**
   * Convert raw provider price to the canonical internal unit.
   * Returns: Rial per gram (reference purity TBD — §13.1)
   */
  normalize(raw: RawPriceData): Decimal;

  /** Describe what the canonical output unit represents */
  getCanonicalUnit(): string;
}

export const PRICE_NORMALIZER_TOKEN = Symbol('PRICE_NORMALIZER_PORT');
