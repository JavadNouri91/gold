export type ActivityRangePreset = 'today' | '7d' | '30d' | '90d' | '3m' | '6m' | '1y' | 'custom';

export const PAYMENT_RANGE_OPTIONS: { id: ActivityRangePreset; label: string }[] = [
  { id: 'today', label: 'امروز' },
  { id: '7d', label: '۷ روز گذشته' },
  { id: '30d', label: '۳۰ روز گذشته' },
  { id: '90d', label: '۹۰ روز گذشته' },
  { id: 'custom', label: 'سفارشی' },
];

export const ACTIVITY_RANGE_OPTIONS: { id: ActivityRangePreset; label: string }[] = [
  { id: '7d', label: '۷ روز گذشته' },
  { id: '30d', label: '۳۰ روز گذشته' },
  { id: '3m', label: '۳ ماه گذشته' },
  { id: '6m', label: '۶ ماه گذشته' },
  { id: '1y', label: '۱ سال گذشته' },
  { id: 'custom', label: 'سفارشی' },
];

export function tehranCivilDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shiftCivilDate(isoDate: string, months: number, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1 + months, (day ?? 1) + days));
  const nextYear = shifted.getUTCFullYear();
  const nextMonth = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const nextDay = String(shifted.getUTCDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

/** Inclusive Tehran window sent to the activity API. Custom returns null until both dates are valid. */
export function activityBounds(
  preset: ActivityRangePreset,
  custom: { from: string; to: string },
  now = new Date(),
): { from: string; to: string } | null {
  if (preset === 'custom') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(custom.from) || !/^\d{4}-\d{2}-\d{2}$/.test(custom.to)) return null;
    if (custom.from > custom.to) return null;
    return {
      from: `${custom.from}T00:00:00.000+03:30`,
      to: `${custom.to}T23:59:59.999+03:30`,
    };
  }

  const today = tehranCivilDate(now);
  const start =
    preset === 'today'
      ? today
      : preset === '7d'
        ? shiftCivilDate(today, 0, -6)
        : preset === '30d'
          ? shiftCivilDate(today, 0, -29)
          : preset === '90d'
            ? shiftCivilDate(today, 0, -89)
            : preset === '3m'
              ? shiftCivilDate(today, -3, 0)
              : preset === '6m'
                ? shiftCivilDate(today, -6, 0)
                : shiftCivilDate(today, -12, 0);

  return {
    from: `${start}T00:00:00.000+03:30`,
    to: `${today}T23:59:59.999+03:30`,
  };
}
