import { floorDivide } from '@/lib/decimal-string';

/**
 * Grams the customer can buy from remaining purchasing power at the live
 * per-gram price. Floors to 0.001 g. Does not apply order fees.
 */
export function buyableGoldGrams(
  availableRial: string | null | undefined,
  pricePerGramRial: string | null | undefined,
): string | null {
  if (availableRial == null || pricePerGramRial == null) return null;
  return floorDivide(availableRial, pricePerGramRial, 3);
}
