import { toLatinDigits } from '@/lib/utils';

/** Latin decimal string, at most 6 fractional digits, matching CreateOrderDto. */
export function normalizeWeightInput(raw: string): string {
  const withDot = raw.replace(/[٫]/g, '.');
  const keepDot = withDot.trim().endsWith('.');
  let latin = toLatinDigits(withDot).replace(/[^\d.]/g, '');
  if (latin.startsWith('.')) latin = `0${latin}`;
  const dot = latin.indexOf('.');
  if (dot === -1) return latin.replace(/^0+(?=\d)/, '');
  const intPart = latin.slice(0, dot).replace(/^0+(?=\d)/, '') || '0';
  const frac = latin.slice(dot + 1).replace(/\./g, '').slice(0, 6);
  if (frac.length === 0) return keepDot ? `${intPart}.` : intPart;
  return `${intPart}.${frac}`;
}

/** Drop a trailing dot so "5." can be priced as 5 grams. */
export function canonicalWeight(value: string): string {
  return value.endsWith('.') ? value.slice(0, -1) : value;
}

export function isPositiveWeight(value: string): boolean {
  const weight = canonicalWeight(value);
  if (!/^\d+(\.\d{1,6})?$/.test(weight)) return false;
  return !/^0+(\.0+)?$/.test(weight);
}
