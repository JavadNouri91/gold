import Decimal from 'decimal.js';
import {
  assertCandidateFits,
  assertSessionShape,
  dayStatus,
  rangesOverlap,
  resolveCaps,
  resolvePersonalCaps,
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

  it('prefers customer over customer-type and inherits null fields from lower layers', () => {
    const typeLimit: LimitView = {
      id: 'type',
      scope: 'CUSTOMER_TYPE',
      scopeKey: 'VIP',
      sessionId: null,
      enabled: true,
      ...caps({
        maxCount: 5,
        maxAmountRial: new Decimal('100'),
        maxWeightGrams: new Decimal('20'),
      }),
    };
    const customerLimit: LimitView = {
      id: 'cust',
      scope: 'CUSTOMER',
      scopeKey: 'cust-1',
      sessionId: null,
      enabled: true,
      ...caps({
        maxCount: null,
        maxAmountRial: new Decimal('40'),
        maxWeightGrams: null,
      }),
    };

    const resolved = resolveCaps(caps({ maxCount: 100 }), [typeLimit, customerLimit], {
      customerId: 'cust-1',
      customerType: 'VIP',
    });
    expect(resolved.maxAmountRial?.toString()).toBe('40');
    expect(resolved.maxWeightGrams?.toString()).toBe('20');
    expect(resolved.maxCount).toBe(5);

    const typeOnly = resolveCaps(caps({ maxCount: 100 }), [typeLimit], {
      customerType: 'VIP',
    });
    expect(typeOnly.maxCount).toBe(5);

    const skipped = resolveCaps(caps({ maxCount: 100 }), [typeLimit], {
      customerType: 'HOUSEHOLD',
    });
    expect(skipped.maxCount).toBe(100);
  });

  it('resolves personal caps without pulling session market ceilings', () => {
    const typeLimit: LimitView = {
      id: 'type',
      scope: 'CUSTOMER_TYPE',
      scopeKey: 'VIP',
      sessionId: null,
      enabled: true,
      ...caps({
        maxCount: null,
        maxAmountRial: new Decimal('100'),
        maxWeightGrams: null,
      }),
    };
    const personal = resolvePersonalCaps([typeLimit], { customerType: 'VIP' });
    expect(personal?.maxAmountRial?.toString()).toBe('100');
    expect(personal?.maxWeightGrams).toBeNull();
    expect(personal?.maxCount).toBeNull();
    expect(resolvePersonalCaps([typeLimit], { customerType: 'PARTNER' })).toBeNull();
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
