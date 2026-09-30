/**
 * Tests for utility helper functions.
 */

import {
  formatRial,
  formatGrams,
  formatPurity,
  formatMobile,
  formatTime,
  formatRelativeTime,
  formatCountdown,
  toPersianDigits,
  latinMobile,
  isValidMobile,
  isPositiveDecimal,
  getStatusColor,
  ORDER_STATUS_LABELS,
  TRADE_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../lib/utils';

describe('formatRial', () => {
  it('formats Rial with separator and unit', () => {
    const result = formatRial('5000000.00');
    expect(result).toContain('ریال');
  });

  it('returns — for null', () => {
    expect(formatRial(null)).toBe('—');
  });

  it('returns — for undefined', () => {
    expect(formatRial(undefined)).toBe('—');
  });

  it('returns — for empty string', () => {
    expect(formatRial('')).toBe('—');
  });

  it('handles integer value', () => {
    expect(formatRial(1000000)).toContain('ریال');
  });
});

describe('formatGrams', () => {
  it('appends گرم unit', () => {
    expect(formatGrams('2.5')).toContain('گرم');
  });

  it('returns — for null', () => {
    expect(formatGrams(null)).toBe('—');
  });

  it('handles string decimal', () => {
    const result = formatGrams('0.500000');
    expect(result).toContain('گرم');
  });
});

describe('formatPurity', () => {
  it('maps 0.750 to ۱۸ عیار', () => {
    expect(formatPurity('0.750000')).toContain('۱۸');
  });

  it('maps 0.999 to ۲۴ عیار', () => {
    expect(formatPurity('0.999000')).toContain('۲۴');
  });

  it('returns — for null', () => {
    expect(formatPurity(null)).toBe('—');
  });
});

describe('isValidMobile', () => {
  it('accepts valid Iranian mobile number', () => {
    expect(isValidMobile('09121234567')).toBe(true);
  });

  it('rejects numbers without 09 prefix', () => {
    expect(isValidMobile('02112345678')).toBe(false);
  });

  it('rejects too-short numbers', () => {
    expect(isValidMobile('09123456')).toBe(false);
  });

  it('rejects numbers with letters', () => {
    expect(isValidMobile('0912abc4567')).toBe(false);
  });

  it('accepts Persian digits', () => {
    expect(isValidMobile('۰۹۱۲۱۲۳۴۵۶۷')).toBe(true);
  });
});

describe('formatMobile', () => {
  it('renders a stored mobile with Persian digits', () => {
    expect(formatMobile('09120001001')).toBe('۰۹۱۲۰۰۰۱۰۰۱');
  });

  it('returns an em dash when empty', () => {
    expect(formatMobile('')).toBe('—');
    expect(formatMobile(null)).toBe('—');
  });

  it('normalizes Persian input back to Latin for storage', () => {
    expect(latinMobile('۰۹۱۲۰۰۰۱۰۰۱')).toBe('09120001001');
  });
});

describe('isPositiveDecimal', () => {
  it('accepts positive numbers', () => {
    expect(isPositiveDecimal('5.5')).toBe(true);
    expect(isPositiveDecimal('0.001')).toBe(true);
  });

  it('rejects zero', () => {
    expect(isPositiveDecimal('0')).toBe(false);
  });

  it('rejects negative numbers', () => {
    expect(isPositiveDecimal('-1')).toBe(false);
  });

  it('rejects non-numeric', () => {
    expect(isPositiveDecimal('abc')).toBe(false);
  });
});

describe('getStatusColor', () => {
  it('returns green for APPROVED', () => {
    expect(getStatusColor('APPROVED')).toBe('green');
  });

  it('returns red for REJECTED', () => {
    expect(getStatusColor('REJECTED')).toBe('red');
  });

  it('returns yellow for PENDING', () => {
    expect(getStatusColor('PENDING')).toBe('yellow');
  });

  it('returns gray for unknown status', () => {
    expect(getStatusColor('UNKNOWN_STATUS')).toBe('gray');
  });
});

describe('status labels', () => {
  it('ORDER_STATUS_LABELS has all expected statuses', () => {
    expect(ORDER_STATUS_LABELS['DRAFT']).toBe('پیش‌نویس');
    expect(ORDER_STATUS_LABELS['SUBMITTED']).toBe('ثبت شده');
    expect(ORDER_STATUS_LABELS['CANCELLED']).toBe('لغو شده');
    expect(ORDER_STATUS_LABELS['COMPLETED']).toBe('تکمیل شده');
  });

  it('TRADE_STATUS_LABELS has all expected statuses', () => {
    expect(TRADE_STATUS_LABELS['CONFIRMED']).toBe('تأیید شده');
    expect(TRADE_STATUS_LABELS['REVERSED']).toBe('برگشت شده');
  });

  it('PAYMENT_STATUS_LABELS has all expected statuses', () => {
    expect(PAYMENT_STATUS_LABELS['PENDING']).toBe('در انتظار تأیید');
    expect(PAYMENT_STATUS_LABELS['VALIDATED']).toBe('تأیید شده');
  });
});

describe('formatTime', () => {
  it('returns — for empty values', () => {
    expect(formatTime(null)).toBe('—');
    expect(formatTime(undefined)).toBe('—');
  });

  it('formats a valid ISO timestamp', () => {
    const result = formatTime('2026-09-29T11:02:00.000Z');
    expect(result).not.toBe('—');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatRelativeTime', () => {
  it('says a few seconds for a fresh timestamp', () => {
    const now = Date.parse('2026-09-29T12:00:10.000Z');
    expect(formatRelativeTime('2026-09-29T12:00:05.000Z', now)).toBe('چند ثانیه پیش');
  });
});

describe('formatCountdown', () => {
  it('formats remaining time with Persian digits', () => {
    const now = Date.parse('2026-09-29T12:00:00.000Z');
    expect(formatCountdown('2026-09-29T12:02:05.000Z', now)).toBe(toPersianDigits('02:05'));
  });

  it('returns null after expiry', () => {
    const now = Date.parse('2026-09-29T12:00:00.000Z');
    expect(formatCountdown('2026-09-29T11:59:00.000Z', now)).toBeNull();
  });
});
