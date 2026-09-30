import Decimal from 'decimal.js';

/**
 * OrderItem domain entity.
 *
 * Represents a single line item within an Order.
 * All monetary/weight fields are Decimal — BR-P05 (never Float).
 */
export class OrderItemEntity {
  readonly id: string;
  readonly orderId: string;

  /** Weight of gold for this line item, in grams */
  readonly weightGrams: Decimal;
  /** Purity ratio e.g. 0.750 for 18K */
  readonly purityRatio: Decimal;

  /** Price per gram at calculation time (from PricingEngine step2AfterGlobalAdj / weight) */
  readonly unitPriceRial: Decimal;
  /** Total price for this line: unitPriceRial × weightGrams */
  readonly totalPriceRial: Decimal;

  readonly description: string | null;
  readonly metadata: unknown;

  readonly createdAt: Date;

  constructor(props: {
    id: string;
    orderId: string;
    weightGrams: Decimal;
    purityRatio: Decimal;
    unitPriceRial: Decimal;
    totalPriceRial: Decimal;
    description: string | null;
    metadata: unknown;
    createdAt: Date;
  }) {
    Object.assign(this, props);
  }
}
