import Decimal from 'decimal.js';
import { BusinessRuleException } from '../../../common/exceptions/business-rule.exception';
import {
  CapFields,
  LimitContext,
  LimitView,
  SessionView,
  TRADING_MESSAGES,
  TradingStatus,
  Usage,
} from './trading.types';

export function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

export function minuteCovered(minute: number, start: number, end: number): boolean {
  return minute >= start && minute < end;
}

export function zeroUsage(): Usage {
  return {
    count: 0,
    amountRial: new Decimal(0),
    weightGrams: new Decimal(0),
  };
}

/** Null fields on an overlay keep the value from the lower layer. */
export function mergeCapFields(base: CapFields, overlay: CapFields): CapFields {
  return {
    maxAmountRial: overlay.maxAmountRial ?? base.maxAmountRial,
    minAmountRial: overlay.minAmountRial ?? base.minAmountRial,
    maxWeightGrams: overlay.maxWeightGrams ?? base.maxWeightGrams,
    minWeightGrams: overlay.minWeightGrams ?? base.minWeightGrams,
    maxCount: overlay.maxCount ?? base.maxCount,
    maxSingleAmountRial: overlay.maxSingleAmountRial ?? base.maxSingleAmountRial,
    maxSingleWeightGrams: overlay.maxSingleWeightGrams ?? base.maxSingleWeightGrams,
  };
}

function emptyCaps(): CapFields {
  return {
    maxAmountRial: null,
    minAmountRial: null,
    maxWeightGrams: null,
    minWeightGrams: null,
    maxCount: null,
    maxSingleAmountRial: null,
    maxSingleWeightGrams: null,
  };
}

function matchLimit(
  applicable: LimitView[],
  scope: LimitView['scope'],
  key: string | undefined,
): LimitView | undefined {
  if (!key) return undefined;
  return applicable.find((limit) => limit.scope === scope && limit.scopeKey === key);
}

/**
 * Aggregate caps for a customer in the current session.
 * Precedence: CUSTOMER → CUSTOMER_TYPE → USER → ROLE → TRANSACTION_TYPE → session.
 * Null fields on a more specific limit inherit from the layer below.
 */
export function resolveCaps(
  session: CapFields,
  limits: LimitView[],
  context: LimitContext,
): CapFields {
  const applicable = limits.filter((limit) => limit.enabled);
  let caps = session;

  const transactionType = matchLimit(applicable, 'TRANSACTION_TYPE', context.transactionType);
  if (transactionType) caps = mergeCapFields(caps, transactionType);

  const role = (context.roleIds ?? [])
    .map((roleId) => matchLimit(applicable, 'ROLE', roleId))
    .find((limit) => limit != null);
  if (role) caps = mergeCapFields(caps, role);

  const user = matchLimit(applicable, 'USER', context.userId);
  if (user) caps = mergeCapFields(caps, user);

  const customerType = matchLimit(applicable, 'CUSTOMER_TYPE', context.customerType);
  if (customerType) caps = mergeCapFields(caps, customerType);

  const customer = matchLimit(applicable, 'CUSTOMER', context.customerId);
  if (customer) caps = mergeCapFields(caps, customer);

  return caps;
}

/**
 * Personal quota for one customer in the session window.
 * Only CUSTOMER / CUSTOMER_TYPE scopes — market session caps are checked separately.
 */
export function resolvePersonalCaps(
  limits: LimitView[],
  context: LimitContext,
): CapFields | null {
  const applicable = limits.filter((limit) => limit.enabled);
  let caps = emptyCaps();
  let found = false;

  const customerType = matchLimit(applicable, 'CUSTOMER_TYPE', context.customerType);
  if (customerType) {
    caps = mergeCapFields(caps, customerType);
    found = true;
  }

  const customer = matchLimit(applicable, 'CUSTOMER', context.customerId);
  if (customer) {
    caps = mergeCapFields(caps, customer);
    found = true;
  }

  if (!found) return null;
  if (
    caps.maxAmountRial == null &&
    caps.maxWeightGrams == null &&
    caps.maxCount == null
  ) {
    return null;
  }
  return caps;
}

export function hasAggregateCeiling(caps: CapFields): boolean {
  return (
    caps.maxAmountRial != null || caps.maxWeightGrams != null || caps.maxCount != null
  );
}

export function limitReached(caps: CapFields, usage: Usage): boolean {
  if (caps.maxCount != null && usage.count >= caps.maxCount) return true;
  if (caps.maxAmountRial != null && usage.amountRial.gte(caps.maxAmountRial)) return true;
  if (caps.maxWeightGrams != null && usage.weightGrams.gte(caps.maxWeightGrams)) return true;
  return false;
}

export function dayStatus(input: {
  holiday: boolean;
  scheduleEnabled: boolean;
  minuteOfDay: number;
  sessions: Array<{
    enabled: boolean;
    startMinute: number;
    endMinute: number;
    limitReached: boolean;
  }>;
}): TradingStatus {
  if (input.holiday) return 'تعطیل';
  const active = input.sessions.find(
    (session) =>
      session.enabled && minuteCovered(input.minuteOfDay, session.startMinute, session.endMinute),
  );
  if (input.scheduleEnabled && active) {
    return active.limitReached ? 'محدودیت تکمیل شده' : 'فعال';
  }
  const enabled = input.sessions.filter((session) => session.enabled);
  if (enabled.length > 0 && enabled.every((session) => input.minuteOfDay >= session.endMinute)) {
    return 'پایان یافته';
  }
  return 'شروع نشده';
}

export function sessionStatus(input: {
  holiday: boolean;
  scheduleEnabled: boolean;
  minuteOfDay: number;
  enabled: boolean;
  startMinute: number;
  endMinute: number;
  limitReached: boolean;
}): TradingStatus {
  if (input.holiday) return 'تعطیل';
  if (input.minuteOfDay >= input.endMinute) return 'پایان یافته';
  if (!input.enabled || !input.scheduleEnabled || input.minuteOfDay < input.startMinute) {
    return 'شروع نشده';
  }
  if (input.limitReached) return 'محدودیت تکمیل شده';
  return 'فعال';
}

/**
 * A candidate trade is allowed when the totals including it stay within the cap.
 * Landing exactly on the cap is allowed. One unit over is rejected.
 */
export function assertCandidateFits(
  caps: CapFields,
  usage: Usage,
  amount: Decimal,
  weight: Decimal,
  messages: {
    amount: string;
    weight: string;
    count: string;
  } = {
    amount: TRADING_MESSAGES.amount,
    weight: TRADING_MESSAGES.weight,
    count: TRADING_MESSAGES.count,
  },
): void {
  if (caps.minAmountRial != null && amount.lt(caps.minAmountRial)) {
    throw new BusinessRuleException('TRADING_SINGLE_AMOUNT', TRADING_MESSAGES.amountMin);
  }
  if (caps.maxSingleAmountRial != null && amount.gt(caps.maxSingleAmountRial)) {
    throw new BusinessRuleException('TRADING_SINGLE_AMOUNT', TRADING_MESSAGES.amountMax);
  }
  if (caps.minWeightGrams != null && weight.lt(caps.minWeightGrams)) {
    throw new BusinessRuleException('TRADING_SINGLE_WEIGHT', TRADING_MESSAGES.weightMin);
  }
  if (caps.maxSingleWeightGrams != null && weight.gt(caps.maxSingleWeightGrams)) {
    throw new BusinessRuleException('TRADING_SINGLE_WEIGHT', TRADING_MESSAGES.weightMax);
  }

  const nextAmount = usage.amountRial.plus(amount);
  const nextWeight = usage.weightGrams.plus(weight);
  const nextCount = usage.count + 1;

  if (caps.maxAmountRial != null && nextAmount.gt(caps.maxAmountRial)) {
    throw new BusinessRuleException('TRADING_AMOUNT_LIMIT', messages.amount);
  }
  if (caps.maxWeightGrams != null && nextWeight.gt(caps.maxWeightGrams)) {
    throw new BusinessRuleException('TRADING_WEIGHT_LIMIT', messages.weight);
  }
  if (caps.maxCount != null && nextCount > caps.maxCount) {
    throw new BusinessRuleException('TRADING_COUNT_LIMIT', messages.count);
  }
}

export function remainingOf(max: Decimal | null, used: Decimal): Decimal | null {
  if (max == null) return null;
  const remaining = max.minus(used);
  return remaining.isNegative() ? new Decimal(0) : remaining;
}

export function percentOf(used: Decimal, max: Decimal | null): number | null {
  if (max == null || max.lte(0)) return null;
  const ratio = used.div(max).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const value = ratio.toNumber();
  return Math.min(100, Math.max(0, value));
}

function hasCeiling(caps: CapFields): boolean {
  return (
    caps.maxAmountRial != null ||
    caps.minAmountRial != null ||
    caps.maxWeightGrams != null ||
    caps.minWeightGrams != null ||
    caps.maxCount != null ||
    caps.maxSingleAmountRial != null ||
    caps.maxSingleWeightGrams != null
  );
}

export function assertSessionShape(input: {
  startMinute: number;
  endMinute: number;
  caps: CapFields;
  siblings: Array<{ id: string; startMinute: number; endMinute: number }>;
  selfId?: string;
  requireLimit: boolean;
}): void {
  if (
    !Number.isInteger(input.startMinute) ||
    !Number.isInteger(input.endMinute) ||
    input.startMinute < 0 ||
    input.endMinute > 24 * 60 ||
    input.startMinute >= input.endMinute
  ) {
    throw new BusinessRuleException('TRADING_TIME_RANGE', TRADING_MESSAGES.timeRange);
  }

  const caps = input.caps;
  const numbers = [
    caps.maxAmountRial,
    caps.minAmountRial,
    caps.maxWeightGrams,
    caps.minWeightGrams,
    caps.maxSingleAmountRial,
    caps.maxSingleWeightGrams,
  ];
  if (numbers.some((value) => value != null && (value.isNegative() || !value.isFinite()))) {
    throw new BusinessRuleException('TRADING_LIMIT_VALUE', TRADING_MESSAGES.negative);
  }
  if (caps.maxCount != null && (!Number.isInteger(caps.maxCount) || caps.maxCount < 0)) {
    throw new BusinessRuleException('TRADING_LIMIT_VALUE', TRADING_MESSAGES.negative);
  }
  if (
    caps.minAmountRial != null &&
    caps.maxAmountRial != null &&
    caps.minAmountRial.gt(caps.maxAmountRial)
  ) {
    throw new BusinessRuleException('TRADING_LIMIT_VALUE', TRADING_MESSAGES.amountOrder);
  }
  if (
    caps.minWeightGrams != null &&
    caps.maxWeightGrams != null &&
    caps.minWeightGrams.gt(caps.maxWeightGrams)
  ) {
    throw new BusinessRuleException('TRADING_LIMIT_VALUE', TRADING_MESSAGES.weightOrder);
  }
  if (input.requireLimit && !hasCeiling(caps)) {
    throw new BusinessRuleException('TRADING_LIMIT_VALUE', TRADING_MESSAGES.requiredLimit);
  }

  const collision = input.siblings.some(
    (sibling) =>
      sibling.id !== input.selfId &&
      rangesOverlap(input.startMinute, input.endMinute, sibling.startMinute, sibling.endMinute),
  );
  if (collision) {
    throw new BusinessRuleException('TRADING_OVERLAP', TRADING_MESSAGES.overlap);
  }
}

export function isTradingWeekday(value: string): value is NonNullable<SessionView['weekday']> {
  return (
    value === 'SATURDAY' ||
    value === 'SUNDAY' ||
    value === 'MONDAY' ||
    value === 'TUESDAY' ||
    value === 'WEDNESDAY' ||
    value === 'THURSDAY' ||
    value === 'FRIDAY'
  );
}
