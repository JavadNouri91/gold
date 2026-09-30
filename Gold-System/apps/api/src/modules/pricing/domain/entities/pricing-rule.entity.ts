import Decimal from 'decimal.js';
import { CustomerType, AdjustmentDirection } from '@gold/shared-types';

export type GroupAdjMode = 'NONE' | 'PERCENTAGE';
export type WageMode = 'NONE' | 'FIXED' | 'PERCENTAGE';
export type DiscountMode = 'NONE' | 'FIXED' | 'PERCENTAGE';
export type RoundingMethod = 'NONE' | 'ROUND_UP' | 'ROUND_DOWN' | 'ROUND_NEAREST';

/**
 * PricingRule — per-CustomerType configuration for pipeline Steps 5, 6 (wage), 8, 9.
 *
 * docs/21-business-decisions.md §1.2:
 *   Step 5: Customer Group Rule (additional +/- % per CustomerType)
 *   Wage: defaults to 0 for molten gold (§1.6)
 *   Step 8: Discount (applied after tax — §1.3)
 *   Step 9: Rounding (configurable — §1.7)
 *
 * customerType = null means "default rule applied when no type-specific rule is found".
 */
export class PricingRuleEntity {
  readonly id: string;
  readonly name: string;
  readonly customerType: CustomerType | null;

  // Step 5: Customer group price adjustment
  readonly groupAdjMode: GroupAdjMode;
  readonly groupAdjValue: Decimal;
  readonly groupAdjDirection: AdjustmentDirection;

  // Wage (§1.6) — defaults to 0 (NONE) for molten gold
  readonly wageMode: WageMode;
  readonly wageValue: Decimal;

  // Discount (§1.3) — applied after tax
  readonly discountMode: DiscountMode;
  readonly discountValue: Decimal;

  // Rounding (§1.7) — configurable
  readonly roundingMethod: RoundingMethod;
  readonly roundingPrecision: Decimal;

  readonly priority: number;
  readonly activeFrom: Date;
  readonly activeTo: Date | null;
  readonly status: string;

  constructor(props: {
    id: string;
    name: string;
    customerType: CustomerType | null;
    groupAdjMode: GroupAdjMode;
    groupAdjValue: Decimal;
    groupAdjDirection: AdjustmentDirection;
    wageMode: WageMode;
    wageValue: Decimal;
    discountMode: DiscountMode;
    discountValue: Decimal;
    roundingMethod: RoundingMethod;
    roundingPrecision: Decimal;
    priority: number;
    activeFrom: Date;
    activeTo: Date | null;
    status: string;
  }) {
    Object.assign(this, props);
  }

  isActive(): boolean {
    const now = new Date();
    if (this.status !== 'ACTIVE') return false;
    if (now < this.activeFrom) return false;
    if (this.activeTo && now > this.activeTo) return false;
    return true;
  }

  /**
   * Step 5: Apply customer group price adjustment to a subtotal.
   * Only PERCENTAGE mode is defined for customer groups (§1.2 Step 5 — "+/- %").
   */
  applyGroupAdj(subtotal: Decimal): Decimal {
    if (this.groupAdjMode === 'NONE') return subtotal;
    const delta = subtotal.times(this.groupAdjValue).dividedBy(100);
    return this.groupAdjDirection === AdjustmentDirection.INCREASE
      ? subtotal.plus(delta)
      : subtotal.minus(delta);
  }

  /**
   * Wage calculation (§1.6).
   * Returns 0 when wageMode is NONE (default for molten gold).
   */
  computeWage(base: Decimal): Decimal {
    switch (this.wageMode) {
      case 'NONE':
        return new Decimal(0);
      case 'FIXED':
        return this.wageValue;
      case 'PERCENTAGE':
        return base.times(this.wageValue).dividedBy(100);
    }
  }

  /**
   * Step 8: Discount (§1.3 — applied after tax).
   * When tax is unresolvable (§13.3), discount is applied to (Step 5 + wage) subtotal.
   */
  computeDiscount(base: Decimal): Decimal {
    switch (this.discountMode) {
      case 'NONE':
        return new Decimal(0);
      case 'FIXED':
        return this.discountValue;
      case 'PERCENTAGE':
        return base.times(this.discountValue).dividedBy(100);
    }
  }

  /**
   * Step 9: Apply rounding (§1.7).
   * Returns { rounded, delta } where delta = rounded - original.
   */
  applyRounding(price: Decimal): { rounded: Decimal; delta: Decimal } {
    if (this.roundingMethod === 'NONE') {
      return { rounded: price, delta: new Decimal(0) };
    }

    const precision = this.roundingPrecision;
    let rounded: Decimal;

    switch (this.roundingMethod) {
      case 'ROUND_UP':
        rounded = price.dividedBy(precision).ceil().times(precision);
        break;
      case 'ROUND_DOWN':
        rounded = price.dividedBy(precision).floor().times(precision);
        break;
      case 'ROUND_NEAREST':
        rounded = price
          .dividedBy(precision)
          .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
          .times(precision);
        break;
      default:
        rounded = price;
    }

    return { rounded, delta: rounded.minus(price) };
  }
}
