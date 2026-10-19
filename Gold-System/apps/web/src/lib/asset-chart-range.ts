import type { ActivityBucket, ActivitySeriesPoint } from '@/lib/api';
import { addDecimal, compareDecimal, isZeroDecimal, multiplyDecimal, subtractDecimal } from '@/lib/decimal-string';
import { activityBounds, tehranCivilDate } from '@/lib/activity-range';
import { toPersianDigits } from '@/lib/utils';

/** Ranges shown on نمودار ارزش دارایی. «همه» is the widest window the activity API accepts. */
export type AssetChartRange = '7d' | '30d' | '3m' | '6m' | '1y' | 'all';

export const ASSET_CHART_RANGES: { id: AssetChartRange; label: string }[] = [
  { id: '7d', label: '۷ روز' },
  { id: '30d', label: '۱ ماه' },
  { id: '3m', label: '۳ ماه' },
  { id: '6m', label: '۶ ماه' },
  { id: '1y', label: '۱ سال' },
  { id: 'all', label: 'همه' },
];

const PERSIAN_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

/**
 * The activity API rejects windows longer than about five years.
 * «همه» therefore means the last four years, not an unbounded lifetime.
 */
export function assetChartBounds(range: AssetChartRange, now = new Date()): { from: string; to: string } {
  if (range === 'all') {
    const end = activityBounds('7d', { from: '', to: '' }, now);
    const start = tehranCivilDate(new Date(now.getTime() - 4 * 365 * 24 * 60 * 60 * 1000));
    return {
      from: `${start}T00:00:00.000+03:30`,
      to: end?.to ?? `${tehranCivilDate(now)}T23:59:59.999+03:30`,
    };
  }
  const bounds = activityBounds(range, { from: '', to: '' }, now);
  if (!bounds) {
    return assetChartBounds('all', now);
  }
  return bounds;
}

export function assetChartBucket(range: AssetChartRange): ActivityBucket {
  if (range === '7d' || range === '30d') return 'day';
  if (range === '3m') return 'week';
  return 'month';
}

export type WeightHistoryBucket = Extract<ActivityBucket, 'day' | 'week' | 'month' | 'quarter'>;

export const WEIGHT_HISTORY_BUCKETS: { id: WeightHistoryBucket; label: string }[] = [
  { id: 'day', label: 'روزانه' },
  { id: 'week', label: 'هفتگی' },
  { id: 'month', label: 'ماهانه' },
  { id: 'quarter', label: 'فصلی' },
];

/** Keep daily/weekly charts readable; monthly and quarterly can look further back. */
export function weightHistoryBounds(bucket: WeightHistoryBucket, now = new Date()): { from: string; to: string } {
  if (bucket === 'day') return assetChartBounds('30d', now);
  if (bucket === 'week') return assetChartBounds('3m', now);
  if (bucket === 'month') return assetChartBounds('1y', now);
  return assetChartBounds('all', now);
}

export function seriesPointLabel(key: string): string {
  if (key.startsWith('M:')) {
    const month = Number(key.slice(8, 10));
    return PERSIAN_MONTHS[month - 1] ?? toPersianDigits(key.slice(2));
  }
  if (key.startsWith('Q:')) {
    return `فصل ${toPersianDigits(key.slice(-1))}`;
  }
  if (key.startsWith('Y:')) return toPersianDigits(key.slice(2));
  if (key.startsWith('W:') || key.startsWith('D:')) {
    const [, month, day] = key.slice(2).split('-');
    const name = PERSIAN_MONTHS[Number(month) - 1] ?? month;
    return `${toPersianDigits(String(Number(day)))} ${name}`;
  }
  return key;
}

/** Booked buy minus booked sell for one activity bucket. Unclassified grams stay out. */
export function netBookedGrams(point: ActivitySeriesPoint): string | null {
  try {
    return subtractDecimal(point.buyGrams, point.sellGrams);
  } catch {
    return null;
  }
}

export interface PortfolioValuePoint {
  key: string;
  label: string;
  valueRial: string;
  grams: string;
}

function floorZero(value: string): string {
  try {
    return compareDecimal(value, '0') < 0 ? '0' : value;
  } catch {
    return '0';
  }
}

export function ownedGoldGrams(weightGrams?: string | null, reservedPickupGrams?: string | null): string {
  const weight = weightGrams && !isZeroDecimal(weightGrams) ? weightGrams : '0';
  const reserved = reservedPickupGrams && !isZeroDecimal(reservedPickupGrams) ? reservedPickupGrams : '0';
  try {
    return addDecimal(weight, reserved);
  } catch {
    return '0';
  }
}

/**
 * Rial value of gold at the live price, plus current buying power.
 * Past market prices are not stored, so the line follows inventory at today's price.
 */
export function portfolioValueSeries(
  points: ActivitySeriesPoint[],
  livePricePerGram: string | null | undefined,
  currentGoldGrams: string,
  availableRial: string | null | undefined,
): PortfolioValuePoint[] {
  const cash = availableRial && !isZeroDecimal(availableRial) ? availableRial : '0';
  const goldNow = currentGoldGrams && !isZeroDecimal(currentGoldGrams) ? currentGoldGrams : '0';
  const hasPrice = Boolean(livePricePerGram && !isZeroDecimal(livePricePerGram));
  const hasGoldStory = !isZeroDecimal(goldNow) || points.length > 0;
  if ((!hasPrice || !hasGoldStory) && isZeroDecimal(cash)) return [];

  const ordered = [...points].sort((left, right) => left.key.localeCompare(right.key));
  let netWindow = '0';
  for (const point of ordered) {
    const net = netBookedGrams(point);
    if (!net) continue;
    try {
      netWindow = addDecimal(netWindow, net);
    } catch {
      /* skip a malformed bucket */
    }
  }

  const valueOf = (grams: string): string => {
    const gold = floorZero(grams);
    const goldRial =
      livePricePerGram && !isZeroDecimal(livePricePerGram) && !isZeroDecimal(gold)
        ? multiplyDecimal(gold, livePricePerGram)
        : '0';
    return addDecimal(goldRial, cash);
  };

  if (ordered.length === 0) {
    const now = valueOf(goldNow);
    return [
      { key: 'start', label: 'شروع', valueRial: now, grams: goldNow },
      { key: 'now', label: 'اکنون', valueRial: now, grams: goldNow },
    ];
  }

  let grams = '0';
  try {
    grams = floorZero(subtractDecimal(goldNow, netWindow));
  } catch {
    grams = '0';
  }
  const series: PortfolioValuePoint[] = [
    { key: `open:${ordered[0]!.key}`, label: 'شروع', valueRial: valueOf(grams), grams },
  ];
  for (const point of ordered) {
    const net = netBookedGrams(point) ?? '0';
    try {
      grams = floorZero(addDecimal(grams, net));
    } catch {
      continue;
    }
    series.push({
      key: point.key,
      label: seriesPointLabel(point.key),
      valueRial: valueOf(grams),
      grams,
    });
  }
  return series;
}
