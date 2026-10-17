import { buyableGoldGrams } from '../lib/buyable-gold';

describe('buyableGoldGrams', () => {
  it('floors purchasing power divided by live price to 0.001 g', () => {
    expect(buyableGoldGrams('100000000.00', '30000000.00')).toBe('3.333');
  });

  it('returns null when power cannot buy 0.001 g', () => {
    expect(buyableGoldGrams('20.00', '30000000.00')).toBeNull();
  });

  it('returns null without a live price or balance', () => {
    expect(buyableGoldGrams(null, '30000000.00')).toBeNull();
    expect(buyableGoldGrams('100000000.00', undefined)).toBeNull();
    expect(buyableGoldGrams('100000000.00', '0')).toBeNull();
  });
});
