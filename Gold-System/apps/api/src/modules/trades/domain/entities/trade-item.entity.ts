import Decimal from 'decimal.js';

/**
 * Trade Item Entity — Phase 3.6
 *
 * Represents a single line-item within a Trade.
 * Values are snapshotted at Trade confirmation and are IMMUTABLE.
 * Never recalculate or update fields on an existing TradeItem.
 */
export class TradeItemEntity {
  readonly id: string;
  readonly tradeId: string;

  /** Gold weight in grams — snapshot from locked Quotation item */
  readonly weightGrams: Decimal;

  /** Purity ratio (0.000–1.000) — snapshot */
  readonly purityRatio: Decimal;

  /** Unit price per gram in Rial — snapshot */
  readonly unitPriceRial: Decimal;

  /** Total price for this line item — snapshot */
  readonly totalPriceRial: Decimal;

  readonly description: string | null;
  readonly createdAt: Date;

  constructor(params: {
    id: string;
    tradeId: string;
    weightGrams: Decimal;
    purityRatio: Decimal;
    unitPriceRial: Decimal;
    totalPriceRial: Decimal;
    description: string | null;
    createdAt: Date;
  }) {
    this.id = params.id;
    this.tradeId = params.tradeId;
    this.weightGrams = params.weightGrams;
    this.purityRatio = params.purityRatio;
    this.unitPriceRial = params.unitPriceRial;
    this.totalPriceRial = params.totalPriceRial;
    this.description = params.description;
    this.createdAt = params.createdAt;
  }
}
