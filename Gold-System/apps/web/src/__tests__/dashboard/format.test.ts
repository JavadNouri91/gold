import { formatMoney } from '@/lib/utils';

describe('authoritative money display', () => {
  it('keeps the backend fraction instead of rounding it', () => {
    expect(formatMoney('1234.239')).toContain('۱,۲۳۴.۲۳۹');
    expect(formatMoney('1234.239')).not.toContain('۱,۲۳۴.۲۴');
  });
});
