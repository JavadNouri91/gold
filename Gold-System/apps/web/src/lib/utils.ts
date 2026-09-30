/**
 * Utility helpers for the Customer Portal.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Persian and Arabic-Indic digits become ASCII 0-9. Other characters stay. */
export function toLatinDigits(value: string): string {
  return value.replace(/[0-9۰-۹٠-٩]/g, (ch) => {
    if (ch >= '0' && ch <= '9') return ch;
    const fa = FA_DIGITS.indexOf(ch);
    if (fa >= 0) return String(fa);
    const ar = AR_DIGITS.indexOf(ch);
    return ar >= 0 ? String(ar) : ch;
  });
}

/** ASCII, Persian, or Arabic digits become Persian ۰-۹. */
export function toPersianDigits(value: string): string {
  return toLatinDigits(value).replace(/\d/g, (digit) => FA_DIGITS[Number(digit)] ?? digit);
}

/** User-visible mobile. Empty values render as `empty` (default em dash). */
export function formatMobile(value: string | null | undefined, empty = '—'): string {
  if (value == null || String(value).trim() === '') return empty;
  return toPersianDigits(String(value).trim());
}

/** Digits only, Latin, capped at an Iranian mobile length. Safe to store and send. */
export function latinMobile(value: string): string {
  return toLatinDigits(value).replace(/\D/g, '').slice(0, 11);
}

/** Digits only, Latin, up to 20 chars — for landline / work phone / fax. */
export function latinPhone(value: string): string {
  return toLatinDigits(value).replace(/\D/g, '').slice(0, 20);
}

// ─── Postal Code (کد پستی) ────────────────────────────────────────────────────

/**
 * Display a 10-digit postal code with Persian digits and a dash after position 5.
 * e.g. "1234567890" → "۱۲۳۴۵-۶۷۸۹۰"
 */
export function formatPostalCode(value: string | null | undefined, empty = '—'): string {
  if (value == null || String(value).trim() === '') return empty;
  const digits = toPersianDigits(toLatinDigits(String(value)).replace(/\D/g, '').slice(0, 10));
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** Strip non-digits, convert to Latin, cap at 10 chars. Safe to store. */
export function latinPostalCode(value: string): string {
  return toLatinDigits(value).replace(/\D/g, '').slice(0, 10);
}

// ─── Email ────────────────────────────────────────────────────────────────────

/**
 * RFC-5321-inspired email format check.
 * Allows subdomains, plus-addressing, and common TLDs.
 * Does NOT call the network — use for instant format feedback only.
 */
export function isValidEmail(value: string): boolean {
  // Basic structure: local@domain.tld
  // local: alphanumeric + ._%+- (no consecutive dots, no leading/trailing dot)
  // domain: labels separated by dots, each label alphanumeric or hyphen
  // TLD: at least 2 alpha chars
  if (!value || value.length > 254) return false;
  const trimmed = value.trim().toLowerCase();
  const emailRe =
    /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+\-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  return emailRe.test(trimmed);
}

// ─── National ID (کد ملی) ────────────────────────────────────────────────────

/** Display a national ID with Persian digits. */
export function formatNationalId(value: string | null | undefined, empty = '—'): string {
  if (value == null || String(value).trim() === '') return empty;
  return toPersianDigits(String(value).trim());
}

/** Strip non-digits, convert Persian/Arabic → Latin, cap at 10 chars. Safe to store. */
export function latinNationalId(value: string): string {
  return toLatinDigits(value).replace(/\D/g, '').slice(0, 10);
}

/**
 * Validate an Iranian 10-digit national ID using the official checksum.
 *
 * Algorithm:
 *   weights = [10, 9, 8, 7, 6, 5, 4, 3, 2]
 *   sum     = Σ d[i] × weights[i]  for i = 0..8
 *   rem     = sum % 11
 *   valid   = (rem < 2 && d[9] === rem) || (rem >= 2 && d[9] === 11 − rem)
 *   Also: all-same-digit codes (0000000000 … 9999999999) are rejected.
 */
export function isValidNationalId(raw: string): boolean {
  const id = latinNationalId(raw);
  if (id.length !== 10) return false;
  if (/^(.)\1{9}$/.test(id)) return false; // e.g. 1111111111
  const d = id.split('').map(Number);
  const sum = d.slice(0, 9).reduce((acc, val, i) => acc + val * (10 - i), 0);
  const rem = sum % 11;
  const check = d[9]!;
  return rem < 2 ? check === rem : check === 11 - rem;
}

export const MOBILE_PLACEHOLDER = formatMobile('09121234567', '');

// ─── Tailwind class merge ─────────────────────────────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Number / currency formatting ────────────────────────────────────────────

/**
 * Format a Rial amount with thousands separators.
 * Input is a string from the backend (Decimal.toFixed(2)).
 */

/**
 * Display a backend decimal string with thousands grouping.
 * Does not parse the value into a float and does not round.
 */
export function formatAuthoritativeDecimal(
  value: string | number | null | undefined,
  suffix: string,
): string {
  if (value == null || value === '') return '—';
  const trimmed = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return `${trimmed} ${suffix}`.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fraction = ''] = unsigned.split('.');
  const grouped = (intPart ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fractionTrimmed = fraction.replace(/0+$/, '');
  const body = fractionTrimmed ? `${grouped}.${fractionTrimmed}` : grouped;
  return `${negative ? '−' : ''}${toPersianDigits(body)} ${suffix}`.trim();
}

export function formatMoney(value: string | number | null | undefined): string {
  return formatAuthoritativeDecimal(value, 'ریال');
}

export function formatWeight(value: string | number | null | undefined): string {
  return formatAuthoritativeDecimal(value, 'گرم');
}

export function formatRial(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return num.toLocaleString('fa-IR') + ' ریال';
}

/**
 * Format gold weight in grams (6 decimal places, trimmed).
 */
export function formatGrams(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  // Remove trailing zeros up to 3 decimal places minimum
  const formatted = num.toFixed(6).replace(/\.?0+$/, '');
  return formatted + ' گرم';
}

/**
 * Format a decimal purity ratio (e.g. 0.750) as "۱۸ عیار" where applicable.
 * Falls back to showing the raw ratio.
 */
export function formatPurity(value: string | null | undefined): string {
  if (!value) return '—';
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  // Map common purities to karat labels
  const karats: Record<string, string> = {
    '0.999': '۲۴ عیار',
    '0.916': '۲۲ عیار',
    '0.750': '۱۸ عیار',
    '0.585': '۱۴ عیار',
  };
  const key = num.toFixed(3);
  return karats[key] ?? `${(num * 100).toFixed(1)}٪`;
}

// ─── Date formatting ──────────────────────────────────────────────────────────

/**
 * Format an ISO date string in Persian locale.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

/**
 * Format an ISO date+time string in Persian locale.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/** How long ago a timestamp was, in Persian. */
export function formatRelativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 10) return 'چند ثانیه پیش';
  if (sec < 60) return `${toPersianDigits(String(sec))} ثانیه پیش`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${toPersianDigits(String(min))} دقیقه پیش`;
  const hr = Math.floor(min / 60);
  return `${toPersianDigits(String(hr))} ساعت پیش`;
}

/** Remaining mm:ss until an ISO instant, Persian digits. Null when already past. */
export function formatCountdown(expiresAt: string | null | undefined, now = Date.now()): string | null {
  if (!expiresAt) return null;
  const t = new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return null;
  const sec = Math.floor((t - now) / 1000);
  if (sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const clock = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return toPersianDigits(clock);
}

/** Clock time only, Persian digits (e.g. ۱۱:۰۲). */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

// ─── Status labels ────────────────────────────────────────────────────────────

export const ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  SUBMITTED: 'ثبت شده',
  QUOTED: 'قیمت‌گذاری شده',
  ASSIGNED: 'در دست بررسی',
  UNDER_REVIEW: 'در حال بررسی',
  REVISION_REQUESTED: 'نیاز به اصلاح',
  REJECTED: 'رد شده',
  APPROVED: 'تأیید شده',
  TRADE_CREATED: 'معامله ایجاد شد',
  SETTLING: 'در حال تسویه',
  COMPLETED: 'تکمیل شده',
  CANCELLED: 'لغو شده',
};

export const TRADE_STATUS_LABELS: Record<string, string> = {
  PENDING_CONFIRMATION: 'در انتظار تأیید',
  CONFIRMED: 'تأیید شده',
  SETTLING: 'در حال تسویه',
  SETTLED: 'تسویه شده',
  COMPLETED: 'تکمیل شده',
  REJECTED: 'رد شده',
  CANCELLED: 'لغو شده',
  REVERSED: 'برگشت شده',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'در انتظار تأیید',
  VALIDATED: 'تأیید شده',
  ALLOCATED: 'تخصیص یافته',
  COMPLETED: 'تکمیل شده',
  FAILED: 'ناموفق',
  REVERSED: 'برگشت شده',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'انتقال بانکی',
  CARD_TO_CARD: 'کارت به کارت',
  CASH: 'نقدی',
};

export const KYC_STATUS_LABELS: Record<string, string> = {
  PENDING: 'در انتظار بررسی',
  UNDER_REVIEW: 'در حال بررسی',
  APPROVED: 'تأیید شده',
  REJECTED: 'رد شده',
};

export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'در انتظار',
  UNDER_REVIEW: 'در حال بررسی',
  APPROVED: 'تأیید شده',
  REJECTED: 'رد شده',
  ACTIVE: 'فعال',
  SUSPENDED: 'معلق',
  BLOCKED: 'مسدود',
};

export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  HOUSEHOLD: 'خانگی',
  PARTNER: 'همکار',
  VIP: 'VIP',
  WHOLESALE: 'عمده‌فروش',
  CORPORATE: 'شرکت',
};

/** Badge label for the signed-in customer. Household keeps the «مشتری» prefix. */
export function customerTypeBadgeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  if (type === 'HOUSEHOLD') return 'مشتری خانگی';
  if (type === 'PARTNER') return 'همکار';
  if (type === 'VIP') return 'VIP';
  return CUSTOMER_TYPE_LABELS[type] ?? type;
}

export const CUSTOMER_ACCOUNT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'فعال',
  INACTIVE: 'غیرفعال',
  BLOCKED: 'مسدود',
  DEBTOR: 'بدهکار',
};

export const CUSTOMER_VERIFICATION_LABELS: Record<string, string> = {
  UNVERIFIED: 'تأیید نشده',
  PENDING_REVIEW: 'در انتظار بررسی',
  VERIFIED: 'تأیید شده',
  REJECTED: 'رد شده',
};

export const CUSTOMER_SEGMENT_LABELS: Record<string, string> = {
  REGULAR: 'عادی',
  VIP: 'VIP',
  WHOLESALE: 'عمده‌فروش',
  PARTNER: 'همکار',
  NEW: 'مشتری جدید',
  LEGACY: 'مشتری قدیمی',
  INACTIVE: 'مشتری غیرفعال',
};

export const CUSTOMER_FINANCIAL_LABELS: Record<string, string> = {
  DEBTOR: 'بدهکار',
  CREDITOR: 'بستانکار',
  SETTLED: 'تسویه',
};

export const CUSTOMER_GENDER_LABELS: Record<string, string> = {
  MALE: 'مرد',
  FEMALE: 'زن',
  OTHER: 'سایر',
  NOT_SPECIFIED: 'ثبت نشده',
};

export const CUSTOMER_LEVEL_LABELS: Record<string, string> = {
  NORMAL: 'عادی',
  VIP: 'VIP',
  PREMIUM: 'ویژه',
};

export const REFERENCE_SOURCE_LABELS: Record<string, string> = {
  FRIEND_REFERRAL: 'معرفی دوستان',
  INTERNET_SEARCH: 'جستجوی اینترنتی',
  SOCIAL_MEDIA: 'شبکه‌های اجتماعی',
  IN_PERSON: 'مراجعه حضوری',
  ADVERTISEMENT: 'تبلیغات',
  OTHER: 'سایر',
};

export const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'در انتظار بررسی',
  UNDER_REVIEW: 'در حال بررسی',
  APPROVED: 'تأیید شده',
  REJECTED: 'رد شده',
};

export const SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'در انتظار',
  PARTIAL: 'تسویه جزئی',
  COMPLETED: 'تسویه کامل',
  SETTLED: 'تسویه شده',
};

export const QUOTATION_STATUS_LABELS: Record<string, string> = {
  GENERATED: 'ایجاد شده',
  ACTIVE: 'فعال',
  EXPIRED: 'منقضی',
  REVISED: 'نسخه جایگزین',
  CONVERTED: 'تبدیل به معامله',
};

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'فعال',
  COMPLETED: 'تکمیل شده',
  CANCELLED: 'لغو شده',
};

export const PURCHASE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  CONFIRMED: 'تأیید شده',
};

export const SUPPLIER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'فعال',
  SUSPENDED: 'معلق',
  INACTIVE: 'غیرفعال',
};

export const LEDGER_DIRECTION_LABELS: Record<string, string> = {
  DEBIT: 'بدهکار',
  CREDIT: 'بستانکار',
  IN: 'ورود',
  OUT: 'خروج',
};

export function statusLabel(
  map: Record<string, string>,
  status: string | null | undefined,
): string {
  if (!status) return '—';
  return map[status] ?? status;
}

// ─── Status colour helpers ────────────────────────────────────────────────────

export function getStatusColor(status: string): string {
  const green = [
    'APPROVED',
    'ACTIVE',
    'COMPLETED',
    'CONFIRMED',
    'VALIDATED',
    'ALLOCATED',
    'SETTLED',
  ];
  const red = ['REJECTED', 'CANCELLED', 'FAILED', 'REVERSED', 'SUSPENDED', 'BLOCKED', 'DEBTOR'];
  const yellow = ['PENDING', 'UNDER_REVIEW', 'SUBMITTED', 'SETTLING', 'QUOTED', 'PARTIAL'];
  if (green.includes(status)) return 'green';
  if (red.includes(status)) return 'red';
  if (yellow.includes(status)) return 'yellow';
  return 'gray';
}

// ─── Input validation ─────────────────────────────────────────────────────────

export function isValidMobile(mobile: string): boolean {
  return /^09\d{9}$/.test(latinMobile(mobile));
}

export function isPositiveDecimal(value: string): boolean {
  const n = parseFloat(value);
  return !isNaN(n) && n > 0;
}
