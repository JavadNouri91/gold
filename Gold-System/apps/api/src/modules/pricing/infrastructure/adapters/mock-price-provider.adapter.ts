import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import {
  PriceProviderPort,
  RawPriceData,
  MarketStatus,
} from '../../domain/ports/price-provider.port';
import {
  PriceProviderUnavailableError,
  InvalidPriceResponseError,
} from '../../domain/exceptions/pricing.exceptions';

/**
 * Mock price provider for development and testing.
 *
 * Returns a configurable static price.
 * Can be configured to simulate failures via MOCK_PRICE_PROVIDER_FAIL env var.
 *
 * IMPORTANT: This adapter is for development ONLY.
 * Production requires a real provider once §13.1 is resolved.
 *
 * Unit context: Since §13.1 (API unit, purity, normalizer) is OPEN,
 * the mock reports unit = "IRR_PER_GRAM" and purityReference = "MOCK".
 * The mock normalizer returns rawValue unchanged.
 *
 * Default mock price: 70,000,000 IRR/gram (70 million Toman/gram)
 * Override via MOCK_PRICE_IRR_PER_GRAM env var.
 */
@Injectable()
export class MockPriceProviderAdapter implements PriceProviderPort {
  private readonly logger = new Logger(MockPriceProviderAdapter.name);
  readonly providerName = 'mock';

  // Whether to simulate provider failure (for testing error paths)
  private readonly simulateFailure: boolean;
  private readonly mockPriceIrrPerGram: Decimal;

  constructor(private readonly config: ConfigService) {
    this.simulateFailure = this.config.get<string>('MOCK_PRICE_PROVIDER_FAIL', 'false') === 'true';
    this.mockPriceIrrPerGram = new Decimal(
      this.config.get<string>('MOCK_PRICE_IRR_PER_GRAM', '70000000'),
    );
  }

  async getLatestPrice(): Promise<RawPriceData> {
    if (this.simulateFailure) {
      throw new PriceProviderUnavailableError(
        this.providerName,
        'MOCK_PRICE_PROVIDER_FAIL=true simulates unavailability',
      );
    }

    // Validate that the mock price is sensible
    if (!this.mockPriceIrrPerGram.isFinite() || this.mockPriceIrrPerGram.lte(0)) {
      throw new InvalidPriceResponseError(
        this.providerName,
        `MOCK_PRICE_IRR_PER_GRAM must be a positive number; got ${this.mockPriceIrrPerGram.toString()}`,
      );
    }

    this.logger.debug(`[MOCK] Returning price: ${this.mockPriceIrrPerGram.toFixed(0)} IRR/gram`);

    return {
      rawValue: this.mockPriceIrrPerGram,
      unit: 'IRR_PER_GRAM', // §13.1 OPEN — canonical unit TBD
      purityReference: 'MOCK', // §13.1 OPEN — purity TBD
      currency: 'IRR',
      capturedAt: new Date(),
      externalRef: `mock-${Date.now()}`,
      metadata: {
        source: 'MockPriceProvider',
        note: 'Development mock — §13.1 OPEN; replace with real provider',
      },
    };
  }

  async getMarketStatus(): Promise<MarketStatus> {
    if (this.simulateFailure) return 'UNKNOWN';
    return 'OPEN';
  }
}
