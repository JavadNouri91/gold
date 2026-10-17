export type OrderPeriod = 'day' | 'week' | 'month' | 'year';

export const ORDER_PERIOD_LABELS: Record<OrderPeriod, string> = {
  day: 'امروز',
  week: 'هفته',
  month: 'ماه',
  year: 'سال',
};

const TEHRAN = 'Asia/Tehran';

function tehranParts(date: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TEHRAN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { y: pick('year'), m: pick('month'), d: pick('day') };
}

function tehranDayUtc(date: Date): number {
  const { y, m, d } = tehranParts(date);
  return Date.UTC(y, m - 1, d);
}

export function orderInPeriod(
  createdAt: string,
  period: OrderPeriod,
  now: Date = new Date(),
): boolean {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const nowParts = tehranParts(now);
  const createdParts = tehranParts(created);
  if (period === 'day') {
    return createdParts.y === nowParts.y && createdParts.m === nowParts.m && createdParts.d === nowParts.d;
  }
  if (period === 'week') {
    const diffDays = Math.round((tehranDayUtc(now) - tehranDayUtc(created)) / 86_400_000);
    return diffDays >= 0 && diffDays < 7;
  }
  if (period === 'month') {
    return createdParts.y === nowParts.y && createdParts.m === nowParts.m;
  }
  return createdParts.y === nowParts.y;
}

export function filterOrdersByPeriod<T extends { createdAt: string }>(
  orders: T[],
  period: OrderPeriod,
  now: Date = new Date(),
): T[] {
  return orders.filter((order) => orderInPeriod(order.createdAt, period, now));
}
