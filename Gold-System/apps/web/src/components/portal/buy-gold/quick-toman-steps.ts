import { isZeroDecimal } from '@/lib/decimal-string';
import { rialToToman, tomanToRial, toPersianDigits } from '@/lib/utils';

export interface QuickTomanStep {
  label: string;
  /** Rial amount sent to pricing / order APIs. */
  rial: string;
}

const MILLION = 1_000_000n;

/**
 * Five rounded slices of available credit for buy-tab quick amounts:
 * 20%, 40%, 60%, 80%, and 100% of the balance.
 * Floors to whole millions, then for ≥۱۰ میلیون floors to a multiple of ۱۰ میلیون
 * (e.g. ۱۰۳ میلیون → ۱۰۰ میلیون).
 */
export function quickTomanStepsFromRial(availableRial: string | null | undefined): QuickTomanStep[] {
  if (availableRial == null || isZeroDecimal(availableRial)) return [];
  const toman = rialToToman(availableRial);
  if (toman == null || isZeroDecimal(toman)) return [];

  const total = floorWholeToman(toman);
  if (total < MILLION) return [];

  const totalRounded = roundQuickToman(total);
  if (totalRounded < MILLION) return [];

  const seen = new Set<string>();
  const steps: QuickTomanStep[] = [];
  for (let n = 1; n <= 5; n += 1) {
    const raw = n === 5 ? total : (total * BigInt(n)) / 5n;
    const rounded = roundQuickToman(raw);
    if (rounded < MILLION) continue;
    const capped = rounded > totalRounded ? totalRounded : rounded;
    const tomanWhole = capped.toString();
    if (seen.has(tomanWhole)) continue;
    seen.add(tomanWhole);
    const rial = tomanToRial(tomanWhole);
    if (rial == null || isZeroDecimal(rial)) continue;
    steps.push({ label: formatQuickTomanLabel(tomanWhole), rial });
  }
  return steps;
}

/** Drop fractional toman (خرده) and keep a non-negative whole-toman bigint. */
function floorWholeToman(toman: string): bigint {
  const trimmed = toman.trim();
  if (trimmed.startsWith('-')) return 0n;
  const [intPart = '0'] = trimmed.split('.');
  return BigInt(intPart || '0');
}

/**
 * Floor to a whole million, then for amounts ≥ ۱۰ میلیون floor the million-count
 * to a multiple of ۱۰ so chips stay round (۱۰۳ → ۱۰۰).
 */
function roundQuickToman(toman: bigint): bigint {
  if (toman < MILLION) return 0n;
  const millions = toman / MILLION;
  if (millions < 10n) return millions * MILLION;
  return (millions / 10n) * 10n * MILLION;
}

/** Compact chip label: whole millions as «X میلیون». */
export function formatQuickTomanLabel(tomanWhole: string): string {
  const value = BigInt(tomanWhole);
  if (value >= MILLION && value % MILLION === 0n) {
    const millions = (value / MILLION).toString();
    return `${toPersianDigits(millions)} میلیون`;
  }
  const grouped = tomanWhole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return toPersianDigits(grouped);
}
