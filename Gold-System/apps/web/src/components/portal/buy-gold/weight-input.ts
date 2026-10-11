import { compareDecimal } from '@/lib/decimal-string';
import { toLatinDigits } from '@/lib/utils';

/** Latin decimal string, at most 3 fractional digits for a buy request. */
export function normalizeWeightInput(raw: string): string {
  const withDot = raw.replace(/[٫]/g, '.');
  const keepDot = withDot.trim().endsWith('.');
  let latin = toLatinDigits(withDot).replace(/[^\d.]/g, '');
  if (latin.startsWith('.')) latin = `0${latin}`;
  const dot = latin.indexOf('.');
  if (dot === -1) return latin.replace(/^0+(?=\d)/, '');
  const intPart = latin.slice(0, dot).replace(/^0+(?=\d)/, '') || '0';
  const frac = latin.slice(dot + 1).replace(/\./g, '').slice(0, 3);
  if (frac.length === 0) return keepDot ? `${intPart}.` : intPart;
  return `${intPart}.${frac}`;
}

/** Drop a trailing dot so "5." can be priced as 5 grams. */
export function canonicalWeight(value: string): string {
  return value.endsWith('.') ? value.slice(0, -1) : value;
}

export function isPositiveWeight(value: string): boolean {
  const weight = canonicalWeight(value);
  if (!/^\d+(\.\d{1,3})?$/.test(weight)) return false;
  return !/^0+(\.0+)?$/.test(weight);
}

/** One milligram less, or null when the result would not be a positive weight. */
export function decreaseWeightByMilli(value: string): string | null {
  const weight = canonicalWeight(value);
  if (!/^\d+(\.\d{1,3})?$/.test(weight)) return null;
  const [intPart, frac = ''] = weight.split('.');
  const milli = Number(intPart) * 1000 + Number((frac + '000').slice(0, 3));
  if (!Number.isSafeInteger(milli) || milli <= 1) return null;
  const next = milli - 1;
  const whole = Math.floor(next / 1000);
  const rem = String(next % 1000).padStart(3, '0').replace(/0+$/, '');
  return rem ? `${whole}.${rem}` : String(whole);
}

/** Largest 3-decimal weight that does not exceed `available`. */
export function capWeightToAvailable(weight: string, available: string): string | null {
  const next = canonicalWeight(normalizeWeightInput(weight));
  if (!isPositiveWeight(next)) return null;
  const avail = canonicalWeight(normalizeWeightInput(available));
  if (!isPositiveWeight(avail)) return null;
  const capped = compareDecimal(next, avail) > 0 ? avail : next;
  return capped.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}
