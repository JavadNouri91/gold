import Decimal from 'decimal.js';

/**
 * CustomerAccount domain entity
 *
 * All monetary fields are Decimal — BR-P05 (never Float for financial values)
 *
 * Credit model — docs/21-business-decisions.md §3:
 *   - creditLimitRial      = Rial prepaid balance capacity (§3.1)
 *   - creditLimitGoldRial  = Rial-denominated gold credit limit (§3.2)
 *   - reservedCreditRial   = blocked at Order submission
 *   - consumedCreditRial   = consumed at Trade approval
 *   - availableRial        = creditLimitRial - reservedCreditRial - consumedCreditRial
 *
 * Gold capacity is COMPUTED not stored:
 *   Available gold grams = creditLimitGoldRial / currentPrice   (§3.2)
 *
 * Reservation, release, and consumption run in CustomerAccountRepository
 * inside the order and trade database transactions.
 */
export class CustomerAccountEntity {
  readonly id: string;
  readonly customerId: string;
  readonly status: string;

  readonly creditLimitRial: Decimal;
  readonly reservedCreditRial: Decimal;
  readonly consumedCreditRial: Decimal;

  readonly creditLimitGoldRial: Decimal;
  readonly reservedCreditGoldRial: Decimal;
  readonly consumedCreditGoldRial: Decimal;

  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: {
    id: string;
    customerId: string;
    status: string;
    creditLimitRial: Decimal;
    reservedCreditRial: Decimal;
    consumedCreditRial: Decimal;
    creditLimitGoldRial: Decimal;
    reservedCreditGoldRial: Decimal;
    consumedCreditGoldRial: Decimal;
    createdAt: Date;
    updatedAt: Date;
  }) {
    Object.assign(this, props);
  }

  /**
   * Available Rial credit
   * available = limit - reserved - consumed
   */
  get availableRial(): Decimal {
    return this.creditLimitRial.minus(this.reservedCreditRial).minus(this.consumedCreditRial);
  }

  /**
   * Available Gold Rial credit (Rial portion)
   */
  get availableGoldRial(): Decimal {
    return this.creditLimitGoldRial
      .minus(this.reservedCreditGoldRial)
      .minus(this.consumedCreditGoldRial);
  }

  isActive(): boolean {
    return this.status === 'ACTIVE';
  }
}
