/**
 * Temporary visual series for the credit trend chart.
 *
 * There is no daily credit-snapshot API. These points are NOT the
 * signed-in user's limit, reserved credit, or consumed credit.
 * Do not feed them into orders, payments, or any persisted balance.
 *
 * Replace this module when a server history endpoint exists.
 */

export type CreditTrendPeriod = '7d' | '30d' | '3m';

export const CREDIT_TREND_PERIODS: { id: CreditTrendPeriod; label: string }[] = [
  { id: '7d', label: '۷ روز' },
  { id: '30d', label: '۳۰ روز' },
  { id: '3m', label: '۳ ماه' },
];

export interface CreditTrendPoint {
  id: string;
  label: string;
  available: string;
  reserved: string;
  consumed: string;
}

export interface CreditTrendSeries {
  source: 'preview';
  period: CreditTrendPeriod;
  points: CreditTrendPoint[];
}

const WEEK: CreditTrendPoint[] = [
  point('w1', '۱ مهر', '40', '10', '20'),
  point('w2', '۲ مهر', '36', '14', '22'),
  point('w3', '۳ مهر', '30', '18', '24'),
  point('w4', '۴ مهر', '28', '16', '26'),
  point('w5', '۵ مهر', '32', '12', '28'),
  point('w6', '۶ مهر', '34', '10', '30'),
  point('w7', '۷ مهر', '38', '8', '32'),
];

const MONTH: CreditTrendPoint[] = [
  point('m1', '۱ مهر', '42', '8', '12'),
  point('m2', '۴ مهر', '36', '12', '16'),
  point('m3', '۷ مهر', '30', '16', '20'),
  point('m4', '۱۰ مهر', '28', '14', '24'),
  point('m5', '۱۳ مهر', '26', '18', '26'),
  point('m6', '۱۶ مهر', '24', '16', '30'),
  point('m7', '۱۹ مهر', '22', '14', '34'),
  point('m8', '۲۲ مهر', '26', '12', '36'),
  point('m9', '۲۵ مهر', '30', '10', '38'),
  point('m10', '۲۸ مهر', '34', '8', '40'),
];

const QUARTER: CreditTrendPoint[] = [
  point('q1', 'مرداد', '48', '6', '10'),
  point('q2', 'شهریور', '40', '12', '18'),
  point('q3', 'مهر', '32', '14', '28'),
  point('q4', 'آبان', '28', '10', '36'),
  point('q5', 'آذر', '30', '8', '40'),
  point('q6', 'دی', '26', '12', '44'),
];

const SERIES: Record<CreditTrendPeriod, CreditTrendPoint[]> = {
  '7d': WEEK,
  '30d': MONTH,
  '3m': QUARTER,
};

export function previewCreditTrend(period: CreditTrendPeriod): CreditTrendSeries {
  return { source: 'preview', period, points: SERIES[period] };
}

function point(
  id: string,
  label: string,
  available: string,
  reserved: string,
  consumed: string,
): CreditTrendPoint {
  return {
    id,
    label,
    available: `${available}000000.00`,
    reserved: `${reserved}000000.00`,
    consumed: `${consumed}000000.00`,
  };
}
