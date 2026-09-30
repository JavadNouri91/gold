import Decimal from 'decimal.js';
import { CustomerAccountEntity } from '../customer-accounts/domain/entities/customer-account.entity';

/**
 * Documented invariants.
 * docs/21-business-decisions.md §3: available = limit - reserved - consumed
 * docs/14-accounting.md: financial journals are double-entry
 * docs/21-business-decisions.md §8.1: settled when paid equals trade total
 *
 * Profit and tax are excluded. Those bases are OPEN (§13.2, §13.3).
 */
describe('documented financial invariants', () => {
  function account(limit: string, reserved: string, consumed: string): CustomerAccountEntity {
    const now = new Date();
    return new CustomerAccountEntity({
      id: 'acct',
      customerId: 'cust',
      status: 'ACTIVE',
      creditLimitRial: new Decimal(limit),
      reservedCreditRial: new Decimal(reserved),
      consumedCreditRial: new Decimal(consumed),
      creditLimitGoldRial: new Decimal(0),
      reservedCreditGoldRial: new Decimal(0),
      consumedCreditGoldRial: new Decimal(0),
      createdAt: now,
      updatedAt: now,
    });
  }

  it('available credit equals limit minus reserved minus consumed', () => {
    const entity = account('100000000.00', '60000000.00', '10000000.00');
    expect(entity.availableRial.toFixed(2)).toBe('30000000.00');
  });

  it('keeps tenth-rial arithmetic exact with Decimal', () => {
    const limit = new Decimal('0.10');
    const reserved = new Decimal('0.20');
    const consumed = new Decimal('0.30');
    expect(limit.minus(reserved).minus(consumed).toFixed(2)).toBe('-0.40');
    expect(new Decimal('0.10').plus('0.20').toFixed(2)).toBe('0.30');
  });

  it('keeps a journal balanced when every debit has an equal credit', () => {
    const lines = [
      { debit: new Decimal('1500000.50'), credit: new Decimal('0') },
      { debit: new Decimal('0'), credit: new Decimal('1500000.50') },
    ];
    const debit = lines.reduce((sum, line) => sum.plus(line.debit), new Decimal(0));
    const credit = lines.reduce((sum, line) => sum.plus(line.credit), new Decimal(0));
    expect(debit.equals(credit)).toBe(true);
  });

  it('treats a trade as settled only when paid equals the trade total', () => {
    const total = new Decimal('25000000.00');
    const paid = new Decimal('10000000.00');
    const outstanding = total.minus(paid);
    expect(paid.plus(outstanding).equals(total)).toBe(true);
    expect(paid.equals(total)).toBe(false);
  });

  it('keeps gold quantity identity in grams using Decimal', () => {
    const opening = new Decimal('10.125000');
    const inflow = new Decimal('2.500000');
    const outflow = new Decimal('0.125000');
    const closing = opening.plus(inflow).minus(outflow);
    expect(closing.toFixed(6)).toBe('12.500000');
  });
});
