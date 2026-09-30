/**
 * Purities already used by the portal.
 * The pricing API accepts any ratio in (0, 1] and does not publish a catalog.
 */
export const TRADING_PURITIES = [
  { value: '0.750000', label: '۷۵۰ (۱۸ عیار)' },
  { value: '0.585000', label: '۵۸۵ (۱۴ عیار)' },
  { value: '0.916000', label: '۹۱۶ (۲۲ عیار)' },
  { value: '0.999000', label: '۹۹۹ (۲۴ عیار)' },
] as const;

export const DEFAULT_PURITY = '0.750000';

export const QUICK_WEIGHTS = ['1', '2', '5', '10', '20', '50'] as const;

export function purityLabel(value: string): string {
  return TRADING_PURITIES.find((item) => item.value === value)?.label ?? value;
}
