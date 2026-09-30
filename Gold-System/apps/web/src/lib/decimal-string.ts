/**
 * Decimal-string arithmetic for display comparisons.
 * Amounts stay in base-10. This is not the pricing engine.
 */

const SCALE = 6;
const ZERO = BigInt(0);
const BASE = BigInt(10) ** BigInt(SCALE);

function toScaled(value: string): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  if (!/^\d+(\.\d+)?$/.test(unsigned)) {
    throw new Error('INVALID_DECIMAL');
  }
  const [intPart, frac = ''] = unsigned.split('.');
  const fracFixed = (frac + '0'.repeat(SCALE)).slice(0, SCALE);
  const scaled = BigInt(intPart || '0') * BASE + BigInt(fracFixed || '0');
  return negative ? -scaled : scaled;
}

function fromScaled(value: bigint): string {
  const negative = value < ZERO;
  const abs = negative ? -value : value;
  const intPart = abs / BASE;
  const frac = (abs % BASE).toString().padStart(SCALE, '0').replace(/0+$/, '');
  const body = frac ? `${intPart.toString()}.${frac}` : intPart.toString();
  return negative ? `-${body}` : body;
}

/** -1 if a < b, 0 if equal, 1 if a > b. */
export function compareDecimal(a: string, b: string): number {
  const as = toScaled(a);
  const bs = toScaled(b);
  if (as === bs) return 0;
  return as < bs ? -1 : 1;
}

export function subtractDecimal(a: string, b: string): string {
  return fromScaled(toScaled(a) - toScaled(b));
}

/**
 * Nearest integer percent for display.
 * This is not a ledger posting and does not change a balance.
 */
export function percentOfDecimal(part: string, whole: string): number | null {
  let portion: bigint;
  let total: bigint;
  try {
    portion = toScaled(part);
    total = toScaled(whole);
  } catch {
    return null;
  }
  if (total <= ZERO) return null;
  if (portion <= ZERO) return 0;
  if (portion >= total) return 100;
  return Number((portion * BigInt(100) + total / BigInt(2)) / total);
}

export function decimalUnits(value: string): bigint | null {
  try {
    return toScaled(value);
  } catch {
    return null;
  }
}

export function isZeroDecimal(value: string | null | undefined): boolean {
  if (value == null || value.trim() === '') return true;
  try {
    return compareDecimal(value, '0') === 0;
  } catch {
    return false;
  }
}
