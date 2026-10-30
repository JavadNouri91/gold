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

/**
 * ASCII, Persian, or Arabic digits become Persian ۰-۹.
 * This is the display rule for every number the site shows. Stored and
 * API values stay Latin; call this (or a formatter that calls it) at render.
 */
export function toPersianDigits(value: string): string {
  return toLatinDigits(value).replace(/\d/g, (digit) => FA_DIGITS[Number(digit)] ?? digit);
}

/** Integer shown on screen. Grouping follows fa-IR; digits are always Persian. */
export function formatFaNumber(value: number, options?: Intl.NumberFormatOptions): string {
  if (!Number.isFinite(value)) return '—';
  return toPersianDigits(value.toLocaleString('fa-IR', options));
}

/**
 * Integer amount for live inputs: Persian digits grouped by thousands.
 * Non-digits are dropped. Strip grouping before sending to the API.
 */
export function formatGroupedPersianInteger(value: string): string {
  const digits = toLatinDigits(value).replace(/\D/g, '');
  if (!digits) return '';
  const trimmed = digits.replace(/^0+(?=\d)/, '');
  const grouped = trimmed.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return toPersianDigits(grouped);
}

/** Decimal for live inputs: Persian digits, thousands grouping on the integer part. */
export function formatGroupedPersianDecimal(value: string): string {
  const latin = toLatinDigits(value).replace(/[^\d.]/g, '');
  if (!latin) return '';
  const dot = latin.indexOf('.');
  const intRaw = (dot === -1 ? latin : latin.slice(0, dot)).replace(/\D/g, '');
  const frac = dot === -1 ? null : latin.slice(dot + 1).replace(/\D/g, '');
  if (!intRaw && frac == null) return '';
  const trimmed = intRaw.replace(/^0+(?=\d)/, '') || '0';
  const grouped = trimmed.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = frac != null ? `${grouped}.${frac}` : grouped;
  return toPersianDigits(body);
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
// Display currency is Toman; API / DB amounts stay in Rial (1 Toman = 10 Rial).

function normalizeDecimalInput(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null;
  const trimmed = toLatinDigits(String(value).trim()).replace(/,/g, '').replace(/\s/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Convert a Rial decimal string to Toman by shifting the radix point one place left.
 * Does not use floating-point arithmetic.
 */
export function rialToToman(value: string | number | null | undefined): string | null {
  const trimmed = normalizeDecimalInput(value);
  if (trimmed == null) return null;
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart = '0', fraction = ''] = unsigned.split('.');
  const digits = `${intPart}${fraction}`;
  let point = intPart.length - 1;
  let padded = digits;
  if (point < 0) {
    padded = `${'0'.repeat(-point)}${digits}`;
    point = 0;
  }
  const whole = (padded.slice(0, point) || '0').replace(/^0+(?=\d)/, '') || '0';
  const frac = padded.slice(point).replace(/0+$/, '');
  const body = frac ? `${whole}.${frac}` : whole;
  return negative && body !== '0' ? `-${body}` : body;
}

/**
 * Convert a Toman decimal string to Rial by shifting the radix point one place right.
 * Does not use floating-point arithmetic.
 */
export function tomanToRial(value: string | number | null | undefined): string | null {
  const trimmed = normalizeDecimalInput(value);
  if (trimmed == null) return null;
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart = '0', fraction = ''] = unsigned.split('.');
  if (!fraction) {
    const body = `${intPart}0`.replace(/^0+(?=\d)/, '') || '0';
    return negative && body !== '0' ? `-${body}` : body;
  }
  const whole = `${intPart}${fraction[0] ?? '0'}`.replace(/^0+(?=\d)/, '') || '0';
  const frac = fraction.slice(1).replace(/0+$/, '');
  const body = frac ? `${whole}.${frac}` : whole;
  return negative && body !== '0' ? `-${body}` : body;
}

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

/** Format a Rial amount for UI display in Toman. */
export function formatMoney(value: string | number | null | undefined): string {
  const toman = rialToToman(value);
  if (toman == null) {
    if (value == null || value === '') return '—';
    return formatAuthoritativeDecimal(value, 'تومان');
  }
  return formatAuthoritativeDecimal(toman, 'تومان');
}

/**
 * Compact Toman for KPI cards: میلیارد / میلیون / هزار.
 * Uses the integer Toman part only; two fraction digits are truncated, not rounded.
 */
export function formatCompactToman(value: string | number | null | undefined): string {
  const toman = rialToToman(value);
  if (toman == null) {
    if (value == null || value === '') return '—';
    return formatAuthoritativeDecimal(value, 'تومان');
  }
  const negative = toman.startsWith('-');
  const unsigned = negative ? toman.slice(1) : toman;
  const intPart = (unsigned.split('.')[0] ?? '0').replace(/^0+(?=\d)/, '') || '0';
  const scaled = compactScale(intPart);
  if (!scaled) return formatAuthoritativeDecimal(negative && intPart !== '0' ? `-${intPart}` : intPart, 'تومان');
  const prefix = negative && intPart !== '0' ? '−' : '';
  return `${prefix}${toPersianDigits(scaled.coeff)} ${scaled.unit} تومان`;
}

function compactScale(intPart: string): { coeff: string; unit: string } | null {
  if (intPart.length >= 10) return { coeff: twoPlaceCoeff(intPart, 9), unit: 'میلیارد' };
  if (intPart.length >= 7) return { coeff: twoPlaceCoeff(intPart, 6), unit: 'میلیون' };
  if (intPart.length >= 4) return { coeff: twoPlaceCoeff(intPart, 3), unit: 'هزار' };
  return null;
}

function twoPlaceCoeff(intPart: string, scale: number): string {
  const whole = intPart.slice(0, intPart.length - scale) || '0';
  const frac = intPart.slice(intPart.length - scale, intPart.length - scale + 2).padEnd(2, '0');
  const trimmed = frac.replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole;
}

/**
 * Format a Rial amount as whole Toman. Fractional toman are dropped, not rounded,
 * so the shown purchasing power never exceeds the stored balance.
 */
export function formatWholeMoney(value: string | number | null | undefined): string {
  const toman = rialToToman(value);
  if (toman == null) {
    if (value == null || value === '') return '—';
    return formatAuthoritativeDecimal(value, 'تومان');
  }
  const negative = toman.startsWith('-');
  const unsigned = negative ? toman.slice(1) : toman;
  const whole = (unsigned.split('.')[0] ?? '0').replace(/^0+(?=\d)/, '') || '0';
  const body = negative && whole !== '0' ? `-${whole}` : whole;
  return formatAuthoritativeDecimal(body, 'تومان');
}

export function formatWeight(value: string | number | null | undefined): string {
  return formatAuthoritativeDecimal(value, 'گرم');
}

/** Alias of formatMoney — Rial storage, Toman display. */
export function formatRial(value: string | number | null | undefined): string {
  return formatMoney(value);
}

/** Percentage or fixed rate locked on a transaction charge snapshot. */
export function formatFeeRate(mode?: string | null, rateValue?: string | null): string | null {
  if (!mode || mode === 'NONE' || rateValue == null || rateValue === '') return null;
  if (mode === 'PERCENTAGE') {
    const trimmed = String(rateValue).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    if (!trimmed) return null;
    return `${toPersianDigits(trimmed)}٪`;
  }
  if (mode === 'FIXED') return 'مبلغ ثابت';
  return null;
}

export function feeLineLabel(
  labelFa?: string | null,
  mode?: string | null,
  rateValue?: string | null,
): string {
  const base = labelFa?.trim() || 'کارمزد';
  const rate = formatFeeRate(mode, rateValue);
  return rate ? `${base} (${rate})` : base;
}

/**
 * Format gold weight in grams with Persian digits and no thousands grouping.
 */
export function formatGrams(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const trimmed = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return '—';
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fraction = ''] = unsigned.split('.');
  const whole = (intPart ?? '0').replace(/^0+(?=\d)/, '') || '0';
  const fractionTrimmed = fraction.replace(/0+$/, '');
  const body = fractionTrimmed ? `${whole}.${fractionTrimmed}` : whole;
  const signed = negative && body !== '0' ? `-${body}` : body;
  return `${toPersianDigits(signed)} گرم`;
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
  return karats[key] ?? `${toPersianDigits((num * 100).toFixed(1))}٪`;
}

// ─── Date formatting ──────────────────────────────────────────────────────────

/**
 * Format an ISO date string in Persian locale.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return toPersianDigits(
      new Date(iso).toLocaleDateString('fa-IR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    );
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
    return toPersianDigits(
      new Date(iso).toLocaleString('fa-IR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
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
    return toPersianDigits(
      new Date(iso).toLocaleTimeString('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
  } catch {
    return '—';
  }
}

// ─── Status labels ────────────────────────────────────────────────────────────

export const ORDER_STATUS_GROUP_LABELS: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  IN_REVIEW: 'در حال بررسی',
  REVISION_REQUESTED: 'نیاز به اصلاح',
  COMPLETED: 'پایان‌یافته',
  CLOSED: 'رد / لغو شده',
};

const ORDER_STATUS_TO_GROUP: Record<string, string> = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'IN_REVIEW',
  QUOTED: 'IN_REVIEW',
  ASSIGNED: 'IN_REVIEW',
  UNDER_REVIEW: 'IN_REVIEW',
  AWAITING_REVIEW: 'IN_REVIEW',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
  APPROVED: 'COMPLETED',
  TRADE_CREATED: 'COMPLETED',
  SETTLING: 'COMPLETED',
  COMPLETED: 'COMPLETED',
  REJECTED: 'CLOSED',
  CANCELLED: 'CLOSED',
};

export const ORDER_STATUS_FILTER_OPTIONS = Object.keys(ORDER_STATUS_GROUP_LABELS).map((value) => ({
  value,
  label: ORDER_STATUS_GROUP_LABELS[value]!,
}));

/** Raw machine statuses and display groups share the five Persian labels. */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  ...ORDER_STATUS_GROUP_LABELS,
  ...Object.fromEntries(
    Object.entries(ORDER_STATUS_TO_GROUP).map(([status, group]) => [
      status,
      ORDER_STATUS_GROUP_LABELS[group] ?? status,
    ]),
  ),
};

export function orderStatusPresentation(status: string): { status: string; label: string } {
  const group = ORDER_STATUS_GROUP_LABELS[status] ? status : ORDER_STATUS_TO_GROUP[status];
  if (!group) return { status, label: status };
  return { status: group, label: ORDER_STATUS_GROUP_LABELS[group] ?? status };
}

/** Buy/sell side of an order or trade. Unclassified rows are not relabeled. */
export const ORDER_SIDE_LABELS: Record<string, string> = {
  BUY: 'خرید',
  SELL: 'فروش',
};

export function orderSideLabel(side?: string | null): string | null {
  if (!side) return null;
  return ORDER_SIDE_LABELS[side] ?? null;
}

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
  WHOLESALE: 'عمده',
  CORPORATE: 'حقوقی',
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
  PARTNER: 'همکار',
  NEW: 'مشتری جدید',
  LEGACY: 'مشتری قدیمی',
  INACTIVE: 'مشتری غیرفعال',
};

export const CUSTOMER_FINANCIAL_LABELS: Record<string, string> = {
  DEBTOR: 'بدهکار',
  CREDITOR: 'دارای موجودی',
  SETTLED: 'تسویه صفر',
};

export const CUSTOMER_GENDER_LABELS: Record<string, string> = {
  MALE: 'مرد',
  FEMALE: 'زن',
  OTHER: 'سایر',
  NOT_SPECIFIED: 'ثبت نشده',
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

export const PICKUP_STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'ثبت‌شده',
  PREPARING: 'در حال آماده‌سازی',
  READY: 'آماده تحویل',
  DELIVERED: 'تحویل‌شده',
  CANCELLED: 'لغو شده',
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
    'TRADE_CREATED',
    'DELIVERED',
    'READY',
  ];
  const red = [
    'REJECTED',
    'CANCELLED',
    'FAILED',
    'REVERSED',
    'SUSPENDED',
    'BLOCKED',
    'DEBTOR',
    'CLOSED',
  ];
  const yellow = [
    'PENDING',
    'UNDER_REVIEW',
    'SUBMITTED',
    'SETTLING',
    'QUOTED',
    'PARTIAL',
    'ASSIGNED',
    'AWAITING_REVIEW',
    'IN_REVIEW',
    'REVISION_REQUESTED',
    'REQUESTED',
    'PREPARING',
  ];
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
