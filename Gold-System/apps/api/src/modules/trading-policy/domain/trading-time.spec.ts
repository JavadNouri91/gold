import { tehranParts, parseClock, sessionWindow, formatClock } from './trading-time';

describe('trading time (Asia/Tehran)', () => {
  it('keeps Friday late evening on the Tehran calendar date', () => {
    const parts = tehranParts(new Date('2024-03-20T20:29:00.000Z'));
    expect(parts.dateKey).toBe('2024-03-20');
    expect(parts.minuteOfDay).toBe(23 * 60 + 59);
    expect(parts.weekday).toBe('WEDNESDAY');
  });

  it('rolls the calendar date and weekday at Tehran midnight', () => {
    const before = tehranParts(new Date('2024-03-22T20:29:00.000Z'));
    const after = tehranParts(new Date('2024-03-22T20:30:00.000Z'));

    expect(before.dateKey).toBe('2024-03-22');
    expect(before.weekday).toBe('FRIDAY');
    expect(before.minuteOfDay).toBe(23 * 60 + 59);

    expect(after.dateKey).toBe('2024-03-23');
    expect(after.weekday).toBe('SATURDAY');
    expect(after.minuteOfDay).toBe(0);
  });

  it('places a session window on the Tehran date, not UTC midnight', () => {
    const window = sessionWindow('2024-03-21', 9 * 60, 13 * 60);
    expect(window.start.toISOString()).toBe('2024-03-21T05:30:00.000Z');
    expect(window.end.toISOString()).toBe('2024-03-21T09:30:00.000Z');
    expect(tehranParts(window.start).minuteOfDay).toBe(9 * 60);
    expect(tehranParts(window.end).minuteOfDay).toBe(13 * 60);
  });

  it('parses clock values and treats 24:00 as the end of the day', () => {
    expect(parseClock('09:05')).toBe(9 * 60 + 5);
    expect(parseClock('24:00')).toBe(24 * 60);
    expect(parseClock('24:01')).toBeNull();
    expect(parseClock('۹:۰۰')).toBeNull();
    expect(formatClock(16 * 60)).toBe('16:00');
  });
});
