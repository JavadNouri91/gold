import Decimal from 'decimal.js';
import {
  assertCandidateFits,
  assertSessionShape,
  dayStatus,
  rangesOverlap,
  resolveCaps,
} from './trading-rules';
import { CapFields, LimitView, TRADING_MESSAGES, Usage } from './trading.types';

const caps = (partial: Partial<CapFields> = {}): CapFields => ({
  maxAmountRial: new Decimal('500'),
  minAmountRial: null,
  maxWeightGrams: new Decimal('250'),
  minWeightGrams: null,
  maxCount: 10,
  maxSingleAmountRial: null,
  maxSingleWeightGrams: null,
  ...partial,
});

const usage = (
  partial: Partial<{ count: number; amount: string; weight: string }> = {},
): Usage => ({
  count: partial.count ?? 0,
  amountRial: new Decimal(partial.amount ?? '0'),
  weightGrams: new Decimal(partial.weight ?? '0'),
});

describe('trading rules', () => {
  it('treats touching sessions as non-overlapping and crossing sessions as overlapping', () => {
    expect(rangesOverlap(9 * 60, 13 * 60, 13 * 60, 16 * 60)).toBe(false);
    expect(rangesOverlap(9 * 60, 13 * 60, 12 * 60, 16 * 60)).toBe(true);
  });

  it('rejects an overlapping sibling and a missing ceiling', () => {
    expect(() =>
      assertSessionShape({
        startMinute: 10 * 60,
        endMinute: 12 * 60,
        caps: caps(),
        siblings: [{ id: 'other', startMinute: 9 * 60, endMinute: 13 * 60 }],
        requireLimit: true,
      }),
    ).toThrow(TRADING_MESSAGES.overlap);

    expect(() =>
      assertSessionShape({
        startMinute: 14 * 60,
        endMinute: 10 * 60,
        caps: caps(),
        siblings: [],
        requireLimit: true,
      }),
    ).toThrow(TRADING_MESSAGES.timeRange);

    expect(() =>
      assertSessionShape({
        startMinute: 9 * 60,
        endMinute: 10 * 60,
        caps: caps({
          maxAmountRial: null,
          maxWeightGrams: null,
          maxCount: null,
        }),
        siblings: [],
        requireLimit: true,
      }),
    ).toThrow(TRADING_MESSAGES.requiredLimit);

    expect(() =>
      assertSessionShape({
        startMinute: 9 * 60,
        endMinute: 10 * 60,
        caps: caps({ maxAmountRial: new Decimal('-1') }),
        siblings: [],
        requireLimit: true,
      }),
    ).toThrow(TRADING_MESSAGES.negative);
  });

  it('allows a trade that lands on the cap and rejects one unit over it', () => {
    expect(() =>
      assertCandidateFits(caps(), usage({ amount: '400' }), new Decimal('100'), new Decimal('1')),
    ).not.toThrow();

    expect(() =>
      assertCandidateFits(
        caps(),
        usage({ amount: '400' }),
        new Decimal('100.01'),
        new Decimal('1'),
      ),
    ).toThrow(TRADING_MESSAGES.amount);

    expect(() =>
      assertCandidateFits(caps(), usage({ weight: '200' }), new Decimal('1'), new Decimal('50')),
    ).not.toThrow();

    expect(() =>
      assertCandidateFits(
        caps(),
        usage({ weight: '200' }),
        new Decimal('1'),
        new Decimal('50.000001'),
      ),
    ).toThrow(TRADING_MESSAGES.weight);

    expect(() =>
      assertCandidateFits(caps(), usage({ count: 9 }), new Decimal('1'), new Decimal('1')),
    ).not.toThrow();
    expect(() =>
      assertCandidateFits(caps(), usage({ count: 10 }), new Decimal('1'), new Decimal('1')),
    ).toThrow(TRADING_MESSAGES.count);
  });

  it('prefers a matching role limit over the session caps', () => {
    const roleLimit: LimitView = {
      id: 'limit-1',
      scope: 'ROLE',
      scopeKey: 'role-seller',
      sessionId: 'session-1',
      enabled: true,
      ...caps({ maxCount: 2, maxAmountRial: new Decimal('10'), maxWeightGrams: new Decimal('1') }),
    };

    const matched = resolveCaps(caps({ maxCount: 100 }), [roleLimit], { roleIds: ['role-seller'] });
    expect(matched.maxCount).toBe(2);

    const skipped = resolveCaps(caps({ maxCount: 100 }), [roleLimit], { roleIds: ['role-other'] });
    expect(skipped.maxCount).toBe(100);

    expect(() =>
      assertCandidateFits(matched, usage({ count: 2 }), new Decimal('1'), new Decimal('0.1')),
    ).toThrow(TRADING_MESSAGES.count);
  });

  it('derives the live status from the clock, the holiday, and remaining capacity', () => {
    expect(
      dayStatus({
        holiday: true,
        scheduleEnabled: true,
        minuteOfDay: 10 * 60,
        sessions: [],
      }),
    ).toBe('تعطیل');

    expect(
      dayStatus({
        holiday: false,
        scheduleEnabled: true,
        minuteOfDay: 10 * 60,
        sessions: [{ enabled: true, startMinute: 9 * 60, endMinute: 13 * 60, limitReached: false }],
      }),
    ).toBe('فعال');

    expect(
      dayStatus({
        holiday: false,
        scheduleEnabled: true,
        minuteOfDay: 10 * 60,
        sessions: [{ enabled: true, startMinute: 9 * 60, endMinute: 13 * 60, limitReached: true }],
      }),
    ).toBe('محدودیت تکمیل شده');

    expect(
      dayStatus({
        holiday: false,
        scheduleEnabled: true,
        minuteOfDay: 8 * 60,
        sessions: [{ enabled: true, startMinute: 9 * 60, endMinute: 13 * 60, limitReached: false }],
      }),
    ).toBe('شروع نشده');

    expect(
      dayStatus({
        holiday: false,
        scheduleEnabled: true,
        minuteOfDay: 18 * 60,
        sessions: [{ enabled: true, startMinute: 9 * 60, endMinute: 13 * 60, limitReached: false }],
      }),
    ).toBe('پایان یافته');

    expect(
      dayStatus({
        holiday: false,
        scheduleEnabled: true,
        minuteOfDay: 10 * 60,
        sessions: [
          { enabled: false, startMinute: 9 * 60, endMinute: 13 * 60, limitReached: false },
        ],
      }),
    ).toBe('شروع نشده');
  });
});
