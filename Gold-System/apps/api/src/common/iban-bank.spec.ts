import { ibanBankCode, ibanBankName, isValidIranianIban, normalizeIban } from './iban-bank';

describe('iban-bank', () => {
  it('normalizes Persian digits and spacing', () => {
    expect(normalizeIban('ir۱۲ 0560 0842 0000 1234 5678 90')).toBe('IR120560084200001234567890');
  });

  it('validates IR + 24 digits', () => {
    expect(isValidIranianIban('IR120560084200001234567890')).toBe(true);
    expect(isValidIranianIban('IR12')).toBe(false);
  });

  it('reads the bank code after the check digits', () => {
    expect(ibanBankCode('IR120560084200001234567890')).toBe('056');
    expect(ibanBankName('IR120560084200001234567890')).toBe('بانک سامان');
  });
});
