import { compareDecimal, subtractDecimal } from '@/lib/decimal-string';
import { rialToToman, tomanToRial } from '@/lib/utils';

/** Whole-toman percent of available rial balance; returns toman digit string. */
export function percentOfAvailableToman(availableRial: string, percent: number): string {
  const toman = rialToToman(availableRial);
  if (toman == null) return '0';
  const whole = toman.split('.')[0] ?? '0';
  if (!/^\d+$/.test(whole) || percent <= 0) return '0';
  const value = (BigInt(whole) * BigInt(percent)) / BigInt(100);
  return value.toString();
}

export function remainingAfterWithdrawRial(
  availableRial: string,
  withdrawTomanDigits: string,
): string | null {
  const withdrawRial = tomanToRial(withdrawTomanDigits);
  if (!withdrawRial) return null;
  try {
    if (compareDecimal(withdrawRial, availableRial) > 0) return null;
    return subtractDecimal(availableRial, withdrawRial);
  } catch {
    return null;
  }
}

export function exceedsAvailableBalance(
  availableRial: string | null | undefined,
  withdrawTomanDigits: string,
): boolean {
  if (!availableRial || !withdrawTomanDigits) return false;
  const withdrawRial = tomanToRial(withdrawTomanDigits);
  if (!withdrawRial) return false;
  try {
    return compareDecimal(withdrawRial, availableRial) > 0;
  } catch {
    return false;
  }
}
