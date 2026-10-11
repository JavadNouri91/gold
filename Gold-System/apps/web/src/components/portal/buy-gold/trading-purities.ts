/**
 * Purities already used by the portal.
 * The pricing API accepts any ratio in (0, 1] and does not publish a catalog.
 */
export const TRADING_PURITIES = [
  { value: '0.750000', label: '۷۵۰ (۱۸ عیار)' },
] as const;

export const DEFAULT_PURITY = '0.750000';

export const QUICK_WEIGHTS = ['1', '2', '5', '10', '20', '50'] as const;

/** Everyday toman labels; stored amount is rial (toman × 10). */
export const QUICK_TOMAN_AMOUNTS = [
  { label: '۲۰ میلیون تومان', rial: '200000000' },
  { label: '۵۰ میلیون تومان', rial: '500000000' },
  { label: '۱۰۰ میلیون تومان', rial: '1000000000' },
  { label: '۲۰۰ میلیون تومان', rial: '2000000000' },
  { label: '۵۰۰ میلیون تومان', rial: '5000000000' },
] as const;

export function purityLabel(value: string): string {
  return TRADING_PURITIES.find((item) => item.value === value)?.label ?? value;
}
