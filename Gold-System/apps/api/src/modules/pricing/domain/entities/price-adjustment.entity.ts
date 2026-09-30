import Decimal from 'decimal.js';
import { AdjustmentMode, AdjustmentDirection } from '@gold/shared-types';

/**
 * PriceAdjustment — global seller price adjustment (Pipeline Step 2).
 *
 * docs/21-business-decisions.md §1.4 precedence:
 *   1. Global Seller Adjustment  ← this entity
 *   2. Customer Group Rule       ← PricingRule
 *   3. Additional Discounts
 *
 * Supports: +/- percentage, +/- fixed Rial amount (§1.2 Step 2, docs/12-pricing-engine.md)
 */
export class PriceAdjustmentEntity {
  readonly id: string;
  readonly name: string;
  readonly mode: AdjustmentMode;
  readonly direction: AdjustmentDirection;
  readonly value: Decimal;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly status: string;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: {
    id: string;
    name: string;
    mode: AdjustmentMode;
    direction: AdjustmentDirection;
    value: Decimal;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    status: string;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    Object.assign(this, props);
  }

  isActive(): boolean {
    const now = new Date();
    if (this.status !== 'ACTIVE') return false;
    if (now < this.effectiveFrom) return false;
    if (this.effectiveTo && now > this.effectiveTo) return false;
    return true;
  }

  /**
   * Apply this adjustment to a base price.
   * BR-P04: Adjustment can be Percentage or Fixed, positive or negative sign.
   */
  apply(basePrice: Decimal): Decimal {
    let delta: Decimal;
    if (this.mode === AdjustmentMode.PERCENTAGE) {
      delta = basePrice.times(this.value).dividedBy(100);
    } else {
      delta = this.value;
    }
    return this.direction === AdjustmentDirection.INCREASE
      ? basePrice.plus(delta)
      : basePrice.minus(delta);
  }
}
