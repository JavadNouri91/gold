import { toPersianDigits } from '@/lib/utils';

const JALALI_MONTHS = [
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

const JALALI_QUARTERS = ['بهار', 'تابستان', 'پاییز', 'زمستان'];

/** Display label for a server bucket key such as `M:1405-07`. */
export function activityBucketLabel(key: string): string {
  const [kind, rest] = key.split(':');
  if (!rest) return key;
  if (kind === 'Y') return toPersianDigits(rest);
  if (kind === 'Q') {
    const [year, quarter] = rest.split('-');
    const name = JALALI_QUARTERS[Number(quarter) - 1] ?? quarter;
    return `${name} ${toPersianDigits(year ?? '')}`;
  }
  if (kind === 'M') {
    const [year, month] = rest.split('-');
    const name = JALALI_MONTHS[Number(month) - 1] ?? month;
    return `${name} ${toPersianDigits(year ?? '')}`;
  }
  if (kind === 'W') {
    const [, month, day] = rest.split('-');
    const name = JALALI_MONTHS[Number(month) - 1] ?? month;
    return `${toPersianDigits(String(Number(day)))} ${name}`;
  }
  return key;
}
