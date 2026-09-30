import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PriceNormalizerPort, RawPriceData } from '../../domain/ports/price-provider.port';

/**
 * Mock price normalizer for development.
 *
 * §1.5 of docs/21-business-decisions.md:
 * The Pricing Engine MUST use an abstract PriceNormalizer interface.
 * A concrete normalizer is required per PriceSource adapter.
 *
 * STATUS: §13.1 OPEN — provider not selected, canonical unit not defined.
 *
 * This mock normalizer performs a pass-through:
 *   normalizedValue = rawValue (assumes API already in IRR/gram)
 *
 * A production normalizer must:
 *  1. Know the API unit (e.g. Rial per mithqal, USD per troy oz)
 *  2. Know the reference purity (e.g. 999 fine)
 *  3. Know the target purity for the trade (e.g. 750)
 *  4. Apply purity conversion if §13.1 is resolved
 *
 * The mock normalizer's output unit: "IRR_PER_GRAM" (canonical, TBD)
 */
@Injectable()
export class MockPriceNormalizerAdapter implements PriceNormalizerPort {
  normalize(raw: RawPriceData): Decimal {
    // Passthrough — §13.1 unresolved; no unit/purity conversion applied
    return raw.rawValue;
  }

  getCanonicalUnit(): string {
    // §13.1 OPEN — canonical unit will be defined when provider is selected
    return 'IRR_PER_GRAM (MOCK — unit not confirmed per §13.1)';
  }
}
