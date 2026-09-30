import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessRuleException } from '../../../common/exceptions/business-rule.exception';
import {
  assertCandidateFits,
  dayStatus,
  limitReached,
  minuteCovered,
  resolveCaps,
  sessionStatus,
} from '../domain/trading-rules';
import { sessionWindow, tehranParts } from '../domain/trading-time';
import {
  LimitContext,
  SessionView,
  TRADING_MESSAGES,
  TradingStatus,
  Usage,
} from '../domain/trading.types';
import { TradingRepository } from '../infrastructure/trading.repository';

export const TRADING_CLOCK = Symbol('TRADING_CLOCK');
export type TradingClock = () => Date;

export interface AssessedSession {
  session: SessionView;
  usage: Usage;
  status: TradingStatus;
  reached: boolean;
}

export interface TradingAssessment {
  at: Date;
  dateKey: string;
  minuteOfDay: number;
  scheduleEnabled: boolean;
  holiday: boolean;
  holidayTitle: string | null;
  special: boolean;
  status: TradingStatus;
  open: boolean;
  sessions: AssessedSession[];
  active: AssessedSession | null;
}

export interface TransactionCheck {
  at?: Date;
  amountRial: Decimal.Value;
  weightGrams: Decimal.Value;
  customerId?: string;
  userId?: string;
  /** When set, role lookup is skipped and these ids are used as-is. */
  roleIds?: string[];
  transactionType?: string;
  tx?: Prisma.TransactionClient;
}

export interface RemainingLimits {
  sessionId: string;
  title: string;
  startMinute: number;
  endMinute: number;
  status: TradingStatus;
  count: { max: number | null; used: number; remaining: number | null };
  amountRial: { max: string | null; used: string; remaining: string | null };
  weightGrams: { max: string | null; used: string; remaining: string | null };
}

@Injectable()
export class TradingPolicyService {
  constructor(
    private readonly repo: TradingRepository,
    @Inject(TRADING_CLOCK) private readonly clock: TradingClock,
  ) {}

  async isTradingOpen(at?: Date): Promise<boolean> {
    const assessment = await this.assess(at ?? this.clock());
    return assessment.open;
  }

  async assertTradingOpen(at?: Date): Promise<TradingAssessment> {
    const assessment = await this.assess(at ?? this.clock());
    this.assertOpen(assessment);
    return assessment;
  }

  async getActiveSession(at?: Date): Promise<SessionView | null> {
    const assessment = await this.assess(at ?? this.clock());
    return assessment.active?.session ?? null;
  }

  async getRemainingLimits(at?: Date, context: LimitContext = {}): Promise<RemainingLimits | null> {
    const moment = at ?? this.clock();
    const assessment = await this.assess(moment);
    const active = assessment.active;
    if (!active) return null;
    const limits = await this.repo.limitsForSessions([active.session.id]);
    const caps = resolveCaps(
      active.session,
      limits.filter((limit) => limit.sessionId === active.session.id),
      context,
    );
    const amountRemaining = remainingString(caps.maxAmountRial, active.usage.amountRial, 2);
    const weightRemaining = remainingString(caps.maxWeightGrams, active.usage.weightGrams, 6);
    const countRemaining =
      caps.maxCount == null ? null : Math.max(0, caps.maxCount - active.usage.count);
    return {
      sessionId: active.session.id,
      title: active.session.title,
      startMinute: active.session.startMinute,
      endMinute: active.session.endMinute,
      status: active.status,
      count: { max: caps.maxCount, used: active.usage.count, remaining: countRemaining },
      amountRial: {
        max: caps.maxAmountRial?.toFixed(2) ?? null,
        used: active.usage.amountRial.toFixed(2),
        remaining: amountRemaining,
      },
      weightGrams: {
        max: caps.maxWeightGrams?.toFixed(6) ?? null,
        used: active.usage.weightGrams.toFixed(6),
        remaining: weightRemaining,
      },
    };
  }

  async validateTransaction(input: TransactionCheck): Promise<void> {
    const amount = new Decimal(input.amountRial);
    const weight = new Decimal(input.weightGrams);
    if (!amount.isFinite() || amount.lte(0) || !weight.isFinite() || weight.lte(0)) {
      throw new BusinessRuleException(
        'TRADING_VALUE',
        'مبلغ و وزن معامله باید بزرگ‌تر از صفر باشد.',
      );
    }

    const at = input.at ?? this.clock();
    const assessment = await this.assess(at);
    if (assessment.holiday) {
      throw new BusinessRuleException('TRADING_HOLIDAY', TRADING_MESSAGES.holiday);
    }
    const active = assessment.sessions.find(
      (item) =>
        item.session.enabled &&
        minuteCovered(assessment.minuteOfDay, item.session.startMinute, item.session.endMinute),
    );
    if (!assessment.scheduleEnabled || !active) {
      throw new BusinessRuleException('TRADING_CLOSED', TRADING_MESSAGES.closed);
    }

    if (input.tx) {
      await this.repo.lockSession(input.tx, active.session.id);
    }
    const window = sessionWindow(
      assessment.dateKey,
      active.session.startMinute,
      active.session.endMinute,
    );
    const usage = await this.repo.usageBetween(window.start, window.end, input.tx);
    const limits = await this.repo.limitsForSessions([active.session.id], input.tx);
    const context = await this.resolveContext(input);
    const caps = resolveCaps(active.session, limits, context);
    assertCandidateFits(caps, usage, amount, weight);
  }

  async assess(at: Date): Promise<TradingAssessment> {
    const parts = tehranParts(at);
    const schedule = await this.repo.ensureSchedule();
    const override = await this.repo.findOverrideByDateKey(parts.dateKey);
    const holiday = Boolean(override?.enabled && override.kind === 'FULL_CLOSURE');
    const special = Boolean(override?.enabled && override.kind === 'SPECIAL_SCHEDULE');
    const sessions = holiday
      ? []
      : special
        ? (override?.sessions ?? [])
        : await this.repo.listWeekly(parts.weekday);

    const assessed = await Promise.all(
      sessions.map(async (session) => {
        const window = sessionWindow(parts.dateKey, session.startMinute, session.endMinute);
        const usage = await this.repo.usageBetween(window.start, window.end);
        const reached = limitReached(session, usage);
        return {
          session,
          usage,
          reached,
          status: sessionStatus({
            holiday,
            scheduleEnabled: schedule.enabled,
            minuteOfDay: parts.minuteOfDay,
            enabled: session.enabled,
            startMinute: session.startMinute,
            endMinute: session.endMinute,
            limitReached: reached,
          }),
        };
      }),
    );

    const status = dayStatus({
      holiday,
      scheduleEnabled: schedule.enabled,
      minuteOfDay: parts.minuteOfDay,
      sessions: assessed.map((item) => ({
        enabled: item.session.enabled,
        startMinute: item.session.startMinute,
        endMinute: item.session.endMinute,
        limitReached: item.reached,
      })),
    });
    const active =
      assessed.find(
        (item) =>
          item.session.enabled &&
          minuteCovered(parts.minuteOfDay, item.session.startMinute, item.session.endMinute),
      ) ?? null;

    return {
      at,
      dateKey: parts.dateKey,
      minuteOfDay: parts.minuteOfDay,
      scheduleEnabled: schedule.enabled,
      holiday,
      holidayTitle: holiday ? (override?.title ?? null) : null,
      special,
      status,
      open: schedule.enabled && !holiday && active != null,
      sessions: assessed,
      active,
    };
  }

  private assertOpen(assessment: TradingAssessment): void {
    if (assessment.holiday) {
      throw new BusinessRuleException('TRADING_HOLIDAY', TRADING_MESSAGES.holiday);
    }
    if (!assessment.open) {
      throw new BusinessRuleException('TRADING_CLOSED', TRADING_MESSAGES.closed);
    }
  }

  private async resolveContext(input: TransactionCheck): Promise<LimitContext> {
    let userId = input.userId;
    if (!userId && input.customerId) {
      userId = (await this.repo.userIdForCustomer(input.customerId)) ?? undefined;
    }
    const roleIds = input.roleIds ?? (userId ? await this.repo.roleIdsForUser(userId) : []);
    return {
      userId,
      customerId: input.customerId,
      roleIds,
      transactionType: input.transactionType,
    };
  }
}

function remainingString(max: Decimal | null, used: Decimal, scale: number): string | null {
  if (max == null) return null;
  const remaining = max.minus(used);
  return (remaining.isNegative() ? new Decimal(0) : remaining).toFixed(scale);
}
