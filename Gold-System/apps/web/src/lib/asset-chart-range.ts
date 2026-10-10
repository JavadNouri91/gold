import type { ActivityBucket, ActivitySeriesPoint } from '@/lib/api';
import { subtractDecimal } from '@/lib/decimal-string';
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
  if (range === '7d') return 'week';
  if (range === 'all') return 'quarter';
  return 'month';
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
  if (key.startsWith('W:')) return toPersianDigits(key.slice(2));
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
