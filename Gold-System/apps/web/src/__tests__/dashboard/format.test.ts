import { formatMoney, rialToToman, tomanToRial } from '@/lib/utils';

describe('authoritative money display', () => {
  it('shows Rial amounts as Toman without rounding away backend fraction digits', () => {
    expect(formatMoney('1234.239')).toBe('۱۲۳.۴۲۳۹ تومان');
    expect(formatMoney('1234.239')).not.toContain('ریال');
  });
});

describe('rialToToman / tomanToRial', () => {
  it('shifts the radix point without floating-point math', () => {
    expect(rialToToman('1234.239')).toBe('123.4239');
    expect(tomanToRial('123.4239')).toBe('1234.239');
    expect(tomanToRial('500000')).toBe('5000000');
    expect(rialToToman('5')).toBe('0.5');
    expect(tomanToRial('0.5')).toBe('5');
    expect(rialToToman('0.5')).toBe('0.05');
    expect(tomanToRial('0.05')).toBe('0.5');
    expect(rialToToman('-1234')).toBe('-123.4');
    expect(tomanToRial('-123.4')).toBe('-1234');
  });

  it('rejects invalid input', () => {
    expect(rialToToman('abc')).toBeNull();
    expect(tomanToRial('')).toBeNull();
    expect(rialToToman(null)).toBeNull();
  });
});
