import { TradingWeekday } from './trading.types';

/** Asia/Tehran has no daylight-saving shift. Offset is a fixed +03:30. */
export const TEHRAN_OFFSET_MINUTES = 3 * 60 + 30;

const JS_WEEKDAYS: TradingWeekday[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

export interface TehranParts {
  year: number;
  month: number;
  day: number;
  weekday: TradingWeekday;
  minuteOfDay: number;
  dateKey: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function tehranParts(at: Date): TehranParts {
  const shifted = new Date(at.getTime() + TEHRAN_OFFSET_MINUTES * 60_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  return {
    year,
    month,
    day,
    weekday: JS_WEEKDAYS[shifted.getUTCDay()] ?? 'SATURDAY',
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    dateKey: `${year}-${pad(month)}-${pad(day)}`,
  };
}

/** UTC instant of Tehran midnight for a `YYYY-MM-DD` calendar date. */
export function tehranDateStartUtc(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - TEHRAN_OFFSET_MINUTES * 60_000);
}

export function sessionWindow(
  dateKey: string,
  startMinute: number,
  endMinute: number,
): { start: Date; end: Date } {
  const dayStart = tehranDateStartUtc(dateKey);
  return {
    start: new Date(dayStart.getTime() + startMinute * 60_000),
    end: new Date(dayStart.getTime() + endMinute * 60_000),
  };
}

export function dateKeyToUtcDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function utcDateToKey(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

/** Accepts `HH:mm`. `24:00` is midnight at the end of the day. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour === 24 && minute === 0) return 24 * 60;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatClock(minute: number): string {
  const hour = Math.floor(minute / 60);
  const rest = minute % 60;
  return `${pad(hour)}:${pad(rest)}`;
}
