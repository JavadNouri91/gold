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
