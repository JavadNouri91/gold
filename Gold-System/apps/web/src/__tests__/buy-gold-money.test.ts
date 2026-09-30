import { compareDecimal, isZeroDecimal, subtractDecimal } from '../lib/decimal-string';
import { canonicalWeight, isPositiveWeight, normalizeWeightInput } from '../components/portal/buy-gold/weight-input';

describe('decimal strings', () => {
  it('compares without binary floating point', () => {
    expect(compareDecimal('10.10', '10.1')).toBe(0);
    expect(compareDecimal('61750000.00', '500000000.00')).toBe(-1);
    expect(compareDecimal('2', '1.999999')).toBe(1);
  });

  it('subtracts rial amounts', () => {
    expect(subtractDecimal('500000000.00', '61750000.00')).toBe('438250000');
    expect(subtractDecimal('1000.00', '2500.50')).toBe('-1500.5');
  });

  it('treats zero-like amounts as zero', () => {
    expect(isZeroDecimal('0.00')).toBe(true);
    expect(isZeroDecimal('0.000100')).toBe(false);
    expect(isZeroDecimal(null)).toBe(true);
  });
});

describe('weight input', () => {
  it('accepts Persian digits and limits precision to 6 places', () => {
    expect(normalizeWeightInput('۵٫۲۵')).toBe('5.25');
    expect(normalizeWeightInput('10.1234567')).toBe('10.123456');
    expect(canonicalWeight('5.')).toBe('5');
  });

  it('rejects zero and empty weights', () => {
    expect(isPositiveWeight('0')).toBe(false);
    expect(isPositiveWeight('0.000')).toBe(false);
    expect(isPositiveWeight('1.5')).toBe(true);
    expect(isPositiveWeight('2.25')).toBe(true);
  });
});
