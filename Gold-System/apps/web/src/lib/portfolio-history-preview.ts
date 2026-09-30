/**
 * Temporary visual series for portfolio charts.
 *
 * There is no customer portfolio-history API. These points are NOT the
 * signed-in user's gold, cost, or profit. Do not feed them into pricing,
 * orders, credit, or any persisted balance.
 *
 * Replace this module when a server history endpoint exists. Do not
 * "fix" the series by recalculating the live price or the ledger.
 */

export type PortfolioPeriod = '1m' | '3m' | '6m' | '1y';

export const PORTFOLIO_PERIODS: { id: PortfolioPeriod; chartLabel: string; performanceLabel: string }[] = [
  { id: '1m', chartLabel: '۱ ماه', performanceLabel: 'ماه گذشته' },
  { id: '3m', chartLabel: '۳ ماه', performanceLabel: '۳ ماه' },
  { id: '6m', chartLabel: '۶ ماه', performanceLabel: '۶ ماه' },
  { id: '1y', chartLabel: '۱ سال', performanceLabel: '۱ سال' },
];

export interface PortfolioHistoryPoint {
  id: string;
  label: string;
  weightGrams: string;
  valueRial: string;
}

export interface PortfolioHistorySeries {
  source: 'preview';
  period: PortfolioPeriod;
  points: PortfolioHistoryPoint[];
}

export interface RialSummary {
  min: string;
  max: string;
  avg: string;
  last: string;
}

/** Illustrative rial-per-gram used only to draw the preview. Not a market quote. */
const PREVIEW_UNIT_RIAL = BigInt('100000000');

const MONTH_WEIGHTS: { label: string; grams: string }[] = [
  { label: '۱ مهر', grams: '10' },
  { label: '۵ مهر', grams: '15' },
  { label: '۱۰ مهر', grams: '20' },
  { label: '۱۵ مهر', grams: '18' },
  { label: '۲۰ مهر', grams: '25' },
  { label: '۲۵ مهر', grams: '22' },
  { label: '۳۰ مهر', grams: '24.75' },
];

const LONGER_WEIGHTS: Record<Exclude<PortfolioPeriod, '1m'>, { label: string; grams: string }[]> = {
  '3m': [
    { label: 'تیر', grams: '8' },
    { label: 'مرداد', grams: '12.5' },
    { label: 'شهریور', grams: '16' },
    { label: 'مهر', grams: '24.75' },
  ],
  '6m': [
    { label: 'فروردین', grams: '4' },
    { label: 'اردیبهشت', grams: '9' },
    { label: 'خرداد', grams: '11' },
    { label: 'تیر', grams: '8' },
    { label: 'مرداد', grams: '14' },
    { label: 'شهریور', grams: '19' },
    { label: 'مهر', grams: '24.75' },
  ],
  '1y': [
    { label: 'آبان', grams: '2' },
    { label: 'آذر', grams: '6' },
    { label: 'دی', grams: '5' },
    { label: 'بهمن', grams: '9' },
    { label: 'اسفند', grams: '7' },
    { label: 'فروردین', grams: '4' },
    { label: 'اردیبهشت', grams: '11' },
    { label: 'خرداد', grams: '13' },
    { label: 'تیر', grams: '10' },
    { label: 'مرداد', grams: '16' },
    { label: 'شهریور', grams: '21' },
    { label: 'مهر', grams: '24.75' },
  ],
};

function rialFromGrams(grams: string): string {
  const [whole, fraction = ''] = grams.split('.');
  const scale = fraction.length;
  const scaled = BigInt((whole || '0') + fraction);
  const product = scaled * PREVIEW_UNIT_RIAL;
  const divisor = BigInt(10) ** BigInt(scale);
  return (product / divisor).toString();
}

function toPoints(period: PortfolioPeriod, rows: { label: string; grams: string }[]): PortfolioHistoryPoint[] {
  return rows.map((row, index) => ({
    id: `${period}-${index}`,
    label: row.label,
    weightGrams: row.grams,
    valueRial: rialFromGrams(row.grams),
  }));
}

export function previewPortfolioHistory(period: PortfolioPeriod): PortfolioHistorySeries {
  const rows = period === '1m' ? MONTH_WEIGHTS : LONGER_WEIGHTS[period];
  return { source: 'preview', period, points: toPoints(period, rows) };
}

/** Display aggregation of an already-built series. Truncates the average toward zero. */
export function summarizePreviewRial(points: PortfolioHistoryPoint[]): RialSummary | null {
  if (!points.length) return null;
  const values = points.map((point) => BigInt(point.valueRial));
  const min = values.reduce((left, right) => (left < right ? left : right));
  const max = values.reduce((left, right) => (left > right ? left : right));
  const sum = values.reduce((left, right) => left + right, BigInt(0));
  const avg = sum / BigInt(values.length);
  return {
    min: min.toString(),
    max: max.toString(),
    avg: avg.toString(),
    last: points[points.length - 1]?.valueRial ?? '0',
  };
}
