import Decimal from 'decimal.js';

/**
 * QuotationItem domain entity.
 *
 * Immutable snapshot of a gold order line item within a Quotation.
 * All monetary/weight fields are Decimal — BR-P05 (never Float).
 *
 * Values are set at Quotation generation and never updated.
 */
export class QuotationItemEntity {
  readonly id: string;
  readonly quotationId: string;

  /** Weight of gold for this line item, in grams */
  readonly weightGrams: Decimal;
  /** Purity ratio e.g. 0.750 for 18K */
  readonly purityRatio: Decimal;

  /** Price per gram from PricingCalculation (immutable snapshot) */
  readonly unitPriceRial: Decimal;
  /** Total price: unitPriceRial × weightGrams (immutable snapshot) */
  readonly totalPriceRial: Decimal;

  readonly description: string | null;
  readonly createdAt: Date;

  constructor(props: {
    id: string;
    quotationId: string;
    weightGrams: Decimal;
    purityRatio: Decimal;
    unitPriceRial: Decimal;
    totalPriceRial: Decimal;
    description: string | null;
    createdAt: Date;
  }) {
    Object.assign(this, props);
  }
}
