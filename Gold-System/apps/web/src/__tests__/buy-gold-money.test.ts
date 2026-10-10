import { compareDecimal, floorDivide, isZeroDecimal, subtractDecimal } from '../lib/decimal-string';
import {
  canonicalWeight,
  decreaseWeightByMilli,
  isPositiveWeight,
  normalizeWeightInput,
} from '../components/portal/buy-gold/weight-input';

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
  it('accepts Persian digits and limits precision to 3 places', () => {
    expect(normalizeWeightInput('۵٫۲۵')).toBe('5.25');
    expect(normalizeWeightInput('10.1234567')).toBe('10.123');
    expect(normalizeWeightInput('1.2')).toBe('1.2');
    expect(canonicalWeight('5.')).toBe('5');
    expect(isPositiveWeight('1.234')).toBe(true);
    expect(isPositiveWeight('1.2345')).toBe(false);
  });

  it('floors the heaviest 3-decimal weight a rial balance can buy', () => {
    expect(floorDivide('1750000000', '265290000', 3)).toBe('6.596');
    expect(floorDivide('500000000', '12350000', 3)).toBe('40.485');
    expect(floorDivide('100', '265290000', 3)).toBeNull();
    expect(decreaseWeightByMilli('6.596')).toBe('6.595');
    expect(decreaseWeightByMilli('0.001')).toBeNull();
  });

  it('rejects zero and empty weights', () => {
    expect(isPositiveWeight('0')).toBe(false);
    expect(isPositiveWeight('0.000')).toBe(false);
    expect(isPositiveWeight('1.5')).toBe(true);
    expect(isPositiveWeight('2.25')).toBe(true);
  });
});
