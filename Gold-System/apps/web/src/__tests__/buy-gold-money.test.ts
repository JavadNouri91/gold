import { compareDecimal, floorDivide, isZeroDecimal, subtractDecimal } from '../lib/decimal-string';
import {
  canonicalWeight,
  capWeightToAvailable,
  decreaseWeightByMilli,
  isPositiveWeight,
  normalizeWeightInput,
} from '../components/portal/buy-gold/weight-input';
import { quickTomanStepsFromRial } from '../components/portal/buy-gold/quick-toman-steps';

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
    expect(capWeightToAvailable('2.123456', '2.123456')).toBe('2.123');
    expect(capWeightToAvailable('2.000000', '2.000000')).toBe('2');
    expect(capWeightToAvailable('8.097', '2.000000')).toBe('2');
    expect(capWeightToAvailable('0.0004', '0.0004')).toBeNull();
  });

  it('builds five rounded toman slices from available rial', () => {
    expect(quickTomanStepsFromRial('1000000000')).toEqual([
      { label: '۲۰ میلیون', rial: '200000000' },
      { label: '۴۰ میلیون', rial: '400000000' },
      { label: '۶۰ میلیون', rial: '600000000' },
      { label: '۸۰ میلیون', rial: '800000000' },
      { label: '۱۰۰ میلیون', rial: '1000000000' },
    ]);
    expect(quickTomanStepsFromRial('500000000.00')).toEqual([
      { label: '۱۰ میلیون', rial: '100000000' },
      { label: '۲۰ میلیون', rial: '200000000' },
      { label: '۳۰ میلیون', rial: '300000000' },
      { label: '۴۰ میلیون', rial: '400000000' },
      { label: '۵۰ میلیون', rial: '500000000' },
    ]);
    // 100_000_000.7 toman → drop خرده; fifths stay clean whole millions.
    expect(quickTomanStepsFromRial('1000000007')).toEqual([
      { label: '۲۰ میلیون', rial: '200000000' },
      { label: '۴۰ میلیون', rial: '400000000' },
      { label: '۶۰ میلیون', rial: '600000000' },
      { label: '۸۰ میلیون', rial: '800000000' },
      { label: '۱۰۰ میلیون', rial: '1000000000' },
    ]);
    // Uneven fifths floor each slice to a whole million toman.
    expect(quickTomanStepsFromRial('1370000000')).toEqual([
      { label: '۲۷ میلیون', rial: '270000000' },
      { label: '۵۴ میلیون', rial: '540000000' },
      { label: '۸۲ میلیون', rial: '820000000' },
      { label: '۱۰۹ میلیون', rial: '1090000000' },
      { label: '۱۳۷ میلیون', rial: '1370000000' },
    ]);
    // 3,165,200 toman fifth → «۳ میلیون».
    expect(quickTomanStepsFromRial('158260000')).toEqual([
      { label: '۳ میلیون', rial: '30000000' },
      { label: '۶ میلیون', rial: '60000000' },
      { label: '۹ میلیون', rial: '90000000' },
      { label: '۱۲ میلیون', rial: '120000000' },
      { label: '۱۵ میلیون', rial: '150000000' },
    ]);
    expect(quickTomanStepsFromRial('5000000')).toEqual([]);
    expect(quickTomanStepsFromRial('0')).toEqual([]);
    expect(quickTomanStepsFromRial(null)).toEqual([]);
  });

  it('rejects zero and empty weights', () => {
    expect(isPositiveWeight('0')).toBe(false);
    expect(isPositiveWeight('0.000')).toBe(false);
    expect(isPositiveWeight('1.5')).toBe(true);
    expect(isPositiveWeight('2.25')).toBe(true);
  });
});
