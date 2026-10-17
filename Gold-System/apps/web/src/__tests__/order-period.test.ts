import { filterOrdersByPeriod, orderInPeriod } from '../lib/order-period';

const now = new Date('2026-10-17T12:00:00.000+03:30');

describe('orderInPeriod', () => {
  it('keeps today in Tehran and drops yesterday', () => {
    expect(orderInPeriod('2026-10-17T00:30:00.000+03:30', 'day', now)).toBe(true);
    expect(orderInPeriod('2026-10-16T23:50:00.000+03:30', 'day', now)).toBe(false);
  });

  it('keeps the last seven calendar days for week', () => {
    expect(orderInPeriod('2026-10-11T10:00:00.000+03:30', 'week', now)).toBe(true);
    expect(orderInPeriod('2026-10-10T10:00:00.000+03:30', 'week', now)).toBe(false);
  });

  it('keeps the current month and year', () => {
    expect(orderInPeriod('2026-10-01T08:00:00.000+03:30', 'month', now)).toBe(true);
    expect(orderInPeriod('2026-09-30T08:00:00.000+03:30', 'month', now)).toBe(false);
    expect(orderInPeriod('2026-01-02T08:00:00.000+03:30', 'year', now)).toBe(true);
    expect(orderInPeriod('2025-12-31T08:00:00.000+03:30', 'year', now)).toBe(false);
  });
});

describe('filterOrdersByPeriod', () => {
  it('returns only matching rows', () => {
    const rows = [
      { id: 'today', createdAt: '2026-10-17T08:00:00.000+03:30' },
      { id: 'week', createdAt: '2026-10-14T08:00:00.000+03:30' },
    ];
    expect(filterOrdersByPeriod(rows, 'day', now).map((row) => row.id)).toEqual(['today']);
    expect(filterOrdersByPeriod(rows, 'week', now).map((row) => row.id)).toEqual(['today', 'week']);
  });
});
