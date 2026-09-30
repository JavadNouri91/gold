import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { AuditService } from '../../audit/application/audit.service';
import { BusinessRuleException } from '../../../common/exceptions/business-rule.exception';
import { assertSessionShape, percentOf, remainingOf } from '../domain/trading-rules';
import { formatClock, parseClock, tehranParts } from '../domain/trading-time';
import {
  CapFields,
  LimitView,
  SessionView,
  TRADING_MESSAGES,
  TRADING_WEEKDAYS,
  TradingLimitScope,
  TradingOverrideKind,
  TradingWeekday,
  WEEKDAY_LABELS,
} from '../domain/trading.types';
import { TradingRepository } from '../infrastructure/trading.repository';
import { TRADING_CLOCK, TradingClock, TradingPolicyService } from './trading-policy.service';

export interface SessionBody {
  title?: string;
  weekday?: TradingWeekday | null;
  dayOverrideId?: string | null;
  startTime?: string;
  endTime?: string;
  enabled?: boolean;
  sortOrder?: number;
  maxAmountRial?: string | null;
  minAmountRial?: string | null;
  maxWeightGrams?: string | null;
  minWeightGrams?: string | null;
  maxCount?: number | null;
  maxSingleAmountRial?: string | null;
  maxSingleWeightGrams?: string | null;
}

export interface OverrideBody {
  date: string;
  kind: TradingOverrideKind;
  title: string;
  enabled: boolean;
  startTime?: string | null;
  endTime?: string | null;
  maxAmountRial?: string | null;
  minAmountRial?: string | null;
  maxWeightGrams?: string | null;
  minWeightGrams?: string | null;
  maxCount?: number | null;
  maxSingleAmountRial?: string | null;
  maxSingleWeightGrams?: string | null;
}

export interface LimitBody {
  sessionId: string;
  scope: TradingLimitScope;
  scopeKey?: string | null;
  enabled?: boolean;
  maxAmountRial?: string | null;
  minAmountRial?: string | null;
  maxWeightGrams?: string | null;
  minWeightGrams?: string | null;
  maxCount?: number | null;
  maxSingleAmountRial?: string | null;
  maxSingleWeightGrams?: string | null;
}

const LIMIT_SCOPES: TradingLimitScope[] = [
  'GLOBAL',
  'ROLE',
  'USER',
  'CUSTOMER',
  'TRANSACTION_TYPE',
];

@Injectable()
export class TradingAdminService {
  constructor(
    private readonly repo: TradingRepository,
    private readonly policy: TradingPolicyService,
    private readonly audit: AuditService,
    @Inject(TRADING_CLOCK) private readonly clock: TradingClock,
  ) {}

  async overview(from?: string, to?: string) {
    const assessment = await this.policy.assess(this.clock());
    const range = this.dateRange(from, to, assessment.dateKey);
    const [weekly, overrides] = await Promise.all([
      this.repo.listWeekly(),
      this.repo.listOverrides(range.from, range.to),
    ]);
    const parts = tehranParts(assessment.at);

    const summary = this.summary(assessment.sessions);
    const active = assessment.active;
    const current = active
      ? {
          sessionId: active.session.id,
          title: active.session.title,
          status: active.status,
          startTime: formatClock(active.session.startMinute),
          endTime: formatClock(active.session.endMinute),
          count: countMeter(active.usage.count, active.session.maxCount),
          weight: meter(active.usage.weightGrams, active.session.maxWeightGrams, 6),
          amount: meter(active.usage.amountRial, active.session.maxAmountRial, 2),
        }
      : null;

    return {
      status: assessment.status,
      open: assessment.open,
      scheduleEnabled: assessment.scheduleEnabled,
      holidayTitle: assessment.holidayTitle,
      serverTime: assessment.at.toISOString(),
      today: {
        date: assessment.dateKey,
        weekday: parts.weekday,
        weekdayLabel: WEEKDAY_LABELS[parts.weekday],
        special: assessment.special,
        sessions: assessment.sessions.map((item) => this.sessionPayload(item.session, item)),
      },
      summary,
      currentLimits: current,
      weekly: TRADING_WEEKDAYS.map((weekday) => ({
        weekday,
        label: WEEKDAY_LABELS[weekday],
        sessions: weekly
          .filter((session) => session.weekday === weekday)
          .map((session) => this.sessionPayload(session)),
      })),
      markers: overrides.map((override) => ({
        id: override.id,
        date: override.date,
        kind: override.kind,
        title: override.title,
        enabled: override.enabled,
        sessions: override.sessions.map((session) => this.sessionPayload(session)),
      })),
    };
  }

  async createSession(actorId: string, input: SessionBody) {
    await this.repo.ensureSchedule();
    const write = this.buildWrite(input, null);
    await this.assertLane(write, undefined);
    const created = await this.repo.createSession(write);
    const limit = await this.repo.syncGlobalLimit(created);
    await this.audit.log({
      actorId,
      actorType: 'USER',
      action: 'TRADING_SESSION_CREATED',
      entityType: 'TradingSession',
      entityId: created.id,
      before: null,
      after: { session: snapshotSession(created), limit: snapshotLimit(limit) },
    });
    return this.sessionPayload(created);
  }

  async updateSession(actorId: string, id: string, input: SessionBody) {
    const current = await this.requireSession(id);
    const write = this.buildWrite(input, current);
    await this.assertLane(write, id);
    const updated = await this.repo.updateSession(id, write);
    const limit = await this.repo.syncGlobalLimit(updated);
    await this.audit.log({
      actorId,
      actorType: 'USER',
      action: 'TRADING_SESSION_UPDATED',
      entityType: 'TradingSession',
      entityId: id,
      before: snapshotSession(current),
      after: { session: snapshotSession(updated), limit: snapshotLimit(limit) },
    });
    return this.sessionPayload(updated);
  }

  async deleteSession(actorId: string, id: string) {
    const current = await this.requireSession(id);
    await this.repo.deleteSession(id);
    await this.audit.log({
      actorId,
      actorType: 'USER',
      action: 'TRADING_SESSION_DELETED',
      entityType: 'TradingSession',
      entityId: id,
      before: snapshotSession(current),
      after: null,
    });
    return { id };
  }

  async copySession(actorId: string, id: string, weekdays: TradingWeekday[]) {
    const source = await this.requireSession(id);
    if (source.dayOverrideId || !source.weekday) {
      throw new BusinessRuleException(
        'TRADING_COPY',
        'فقط برنامه هفتگی قابل کپی به روزهای دیگر است.',
      );
    }
    const targets = [...new Set(weekdays)].filter((day) => day !== source.weekday);
    if (targets.length === 0) {
      throw new BusinessRuleException('TRADING_COPY', 'روز دیگری را برای کپی انتخاب کنید.');
    }
    for (const weekday of targets) {
      const siblings = await this.repo.laneSessions({ weekday });
      assertSessionShape({
        startMinute: source.startMinute,
        endMinute: source.endMinute,
        caps: source,
        siblings,
        requireLimit: false,
      });
    }
    const created = [];
    for (const weekday of targets) {
      const row = await this.repo.createSession({
        ...source,
        weekday,
        dayOverrideId: null,
        sortOrder: source.sortOrder,
      });
      await this.repo.syncGlobalLimit(row);
      created.push(row);
    }
    await this.audit.log({
      actorId,
      actorType: 'USER',
      action: 'TRADING_SESSION_COPIED',
      entityType: 'TradingSession',
      entityId: source.id,
      before: snapshotSession(source),
      after: { weekdays: targets, created: created.map(snapshotSession) },
    });
    return created.map((session) => this.sessionPayload(session));
  }

  async createOverride(actorId: string, input: OverrideBody) {
    this.assertDate(input.date);
    const existing = await this.repo.findOverrideByDateKey(input.date);
    if (existing) {
      throw new BusinessRuleException(
        'TRADING_OVERRIDE_EXISTS',
        'برای این تاریخ قبلاً استثنا ثبت شده است.',
      );
    }
    const created = await this.repo.createOverride({
      date: input.date,
      kind: input.kind,
      title: this.requireTitle(input.title, 'عنوان یا دلیل الزامی است.'),
      enabled: input.enabled,
    });
    if (input.kind === 'SPECIAL_SCHEDULE') {
      await this.writeSpecialSession(created.id, input, null);
    }
    const fresh = await this.requireOverride(created.id);
    await this.audit.log({
      actorId,
      actorType: 'USER',
      action: 'TRADING_OVERRIDE_CREATED',
      entityType: 'TradingDayOverride',
      entityId: fresh.id,
      before: null,
      after: snapshotOverride(fresh),
    });
    return this.overridePayload(fresh);
  }

  async updateOverride(actorId: string, id: string, input: OverrideBody) {
    const current = await this.requireOverride(id);
    this.assertDate(input.date);
    if (input.date !== current.date) {
      const clash = await this.repo.findOverrideByDateKey(input.date);
      if (clash && clash.id !== id) {
        throw new BusinessRuleException(
          'TRADING_OVERRIDE_EXISTS',
          'برای این تاریخ قبلاً استثنا ثبت شده است.',
        );
      }
    }
    await this.repo.updateOverride(id, {
      date: input.date,
      kind: input.kind,
      title: this.requireTitle(input.title, 'عنوان یا دلیل الزامی است.'),
      enabled: input.enabled,
    });
    if (input.kind === 'FULL_CLOSURE') {
      for (const session of current.sessions) {
        await this.repo.deleteSession(session.id);
      }
    } else {
      await this.writeSpecialSession(id, input, current.sessions[0] ?? null);
    }
    const fresh = await this.requireOverride(id);
    await this.audit.log({
      actorId,
      actorType: 'USER',
      action: 'TRADING_OVERRIDE_UPDATED',
      entityType: 'TradingDayOverride',
      entityId: id,
      before: snapshotOverride(current),
      after: snapshotOverride(fresh),
    });
    return this.overridePayload(fresh);
  }

  async deleteOverride(actorId: string, id: string) {
    const current = await this.requireOverride(id);
    await this.repo.deleteOverride(id);
    await this.audit.log({
      actorId,
      actorType: 'USER',
      action: 'TRADING_OVERRIDE_DELETED',
      entityType: 'TradingDayOverride',
      entityId: id,
      before: snapshotOverride(current),
      after: null,
    });
    return { id };
  }

  async upsertLimit(actorId: string, input: LimitBody) {
    if (!LIMIT_SCOPES.includes(input.scope)) {
      throw new BusinessRuleException('TRADING_LIMIT_SCOPE', 'نوع محدوده نامعتبر است.');
    }
    const scopeKey = input.scope === 'GLOBAL' ? null : (input.scopeKey?.trim() ?? '');
    if (input.scope !== 'GLOBAL' && !scopeKey) {
      throw new BusinessRuleException('TRADING_LIMIT_SCOPE', 'کلید محدوده الزامی است.');
    }
    const session = await this.requireSession(input.sessionId);
    const caps = this.capsFromBody(input, session);
    assertSessionShape({
      startMinute: session.startMinute,
      endMinute: session.endMinute,
      caps,
      siblings: [],
      selfId: session.id,
      requireLimit: true,
    });

    if (input.scope === 'GLOBAL') {
      const updated = await this.repo.updateSession(session.id, {
        ...session,
        weekday: session.weekday,
        dayOverrideId: session.dayOverrideId,
        sortOrder: session.sortOrder,
        ...caps,
      });
      const limit = await this.repo.syncGlobalLimit(updated);
      await this.audit.log({
        actorId,
        actorType: 'USER',
        action: 'TRADING_LIMIT_UPDATED',
        entityType: 'TradingLimit',
        entityId: limit.id,
        before: snapshotSession(session),
        after: snapshotLimit(limit),
      });
      return { limit: snapshotLimit(limit), session: this.sessionPayload(updated) };
    }

    const saved = await this.repo.upsertScopedLimit({
      sessionId: session.id,
      scope: input.scope,
      scopeKey,
      enabled: input.enabled ?? true,
      caps,
    });
    await this.audit.log({
      actorId,
      actorType: 'USER',
      action: 'TRADING_LIMIT_UPDATED',
      entityType: 'TradingLimit',
      entityId: saved.limit.id,
      before: saved.previous ? snapshotLimit(saved.previous) : null,
      after: snapshotLimit(saved.limit),
    });
    return { limit: snapshotLimit(saved.limit), session: this.sessionPayload(session) };
  }

  async auditLog(limit = 20, offset = 0) {
    const page = await this.repo.listAudit(clamp(limit, 1, 100), Math.max(0, offset));
    return {
      total: page.total,
      items: page.items.map((item) => ({
        ...item,
        timestamp: item.timestamp.toISOString(),
      })),
    };
  }

  private async writeSpecialSession(
    overrideId: string,
    input: OverrideBody,
    current: SessionView | null,
  ) {
    const startMinute = input.startTime ? this.requireClock(input.startTime) : current?.startMinute;
    const endMinute = input.endTime ? this.requireClock(input.endTime) : current?.endMinute;
    if (startMinute == null || endMinute == null) {
      throw new BusinessRuleException(
        'TRADING_TIME_RANGE',
        'زمان شروع و پایان برنامه اختصاصی الزامی است.',
      );
    }
    const caps = this.capsFromBody(input, current);
    const siblings = (await this.repo.laneSessions({ dayOverrideId: overrideId })).filter(
      (session) => session.id !== current?.id,
    );
    assertSessionShape({
      startMinute,
      endMinute,
      caps,
      siblings,
      selfId: current?.id,
      requireLimit: false,
    });
    const write = {
      title: this.requireTitle(input.title, 'عنوان یا دلیل الزامی است.'),
      weekday: null,
      dayOverrideId: overrideId,
      startMinute,
      endMinute,
      enabled: input.enabled,
      sortOrder: current?.sortOrder ?? 0,
      ...caps,
    };
    const saved = current
      ? await this.repo.updateSession(current.id, write)
      : await this.repo.createSession(write);
    await this.repo.syncGlobalLimit(saved);
  }

  private async assertLane(
    write: ReturnType<TradingAdminService['buildWrite']>,
    selfId: string | undefined,
  ) {
    if (write.dayOverrideId) {
      const override = await this.repo.findOverrideById(write.dayOverrideId);
      if (!override || override.kind !== 'SPECIAL_SCHEDULE') {
        throw new BusinessRuleException(
          'TRADING_SESSION_OWNER',
          'برنامه اختصاصی فقط روی استثنای فعال از نوع برنامه اختصاصی ثبت می‌شود.',
        );
      }
    }
    const siblings = await this.repo.laneSessions({
      weekday: write.weekday,
      dayOverrideId: write.dayOverrideId,
    });
    assertSessionShape({
      startMinute: write.startMinute,
      endMinute: write.endMinute,
      caps: write,
      siblings,
      selfId,
      requireLimit: write.dayOverrideId == null,
    });
  }

  private buildWrite(input: SessionBody, current: SessionView | null) {
    const title = input.title === undefined ? current?.title : input.title;
    const weekday = input.weekday === undefined ? (current?.weekday ?? null) : input.weekday;
    const dayOverrideId =
      input.dayOverrideId === undefined ? (current?.dayOverrideId ?? null) : input.dayOverrideId;
    if (!title?.trim()) {
      throw new BusinessRuleException('TRADING_TITLE', 'عنوان بازه الزامی است.');
    }
    if (Boolean(weekday) === Boolean(dayOverrideId)) {
      throw new BusinessRuleException(
        'TRADING_SESSION_OWNER',
        'بازه باید یا به یک روز هفته یا به یک استثنا وصل باشد.',
      );
    }
    const startMinute =
      input.startTime === undefined ? current?.startMinute : this.requireClock(input.startTime);
    const endMinute =
      input.endTime === undefined ? current?.endMinute : this.requireClock(input.endTime);
    if (startMinute == null || endMinute == null) {
      throw new BusinessRuleException('TRADING_TIME_RANGE', TRADING_MESSAGES.timeRange);
    }
    return {
      title: title.trim(),
      weekday,
      dayOverrideId,
      startMinute,
      endMinute,
      enabled: input.enabled ?? current?.enabled ?? true,
      sortOrder: input.sortOrder ?? current?.sortOrder ?? 0,
      ...this.capsFromBody(input, current),
    };
  }

  private capsFromBody(
    input: Partial<SessionBody> | OverrideBody,
    current: CapFields | null,
  ): CapFields {
    return {
      maxAmountRial: mergeDecimal(input.maxAmountRial, current?.maxAmountRial ?? null, 2),
      minAmountRial: mergeDecimal(input.minAmountRial, current?.minAmountRial ?? null, 2),
      maxWeightGrams: mergeDecimal(input.maxWeightGrams, current?.maxWeightGrams ?? null, 6),
      minWeightGrams: mergeDecimal(input.minWeightGrams, current?.minWeightGrams ?? null, 6),
      maxCount: mergeCount(input.maxCount, current?.maxCount ?? null),
      maxSingleAmountRial: mergeDecimal(
        input.maxSingleAmountRial,
        current?.maxSingleAmountRial ?? null,
        2,
      ),
      maxSingleWeightGrams: mergeDecimal(
        input.maxSingleWeightGrams,
        current?.maxSingleWeightGrams ?? null,
        6,
      ),
    };
  }

  private sessionPayload(
    session: SessionView,
    assessed?: {
      usage: { count: number; amountRial: Decimal; weightGrams: Decimal };
      status: string;
    },
  ) {
    const usage = assessed?.usage;
    return {
      id: session.id,
      title: session.title,
      weekday: session.weekday,
      weekdayLabel: session.weekday ? WEEKDAY_LABELS[session.weekday] : null,
      dayOverrideId: session.dayOverrideId,
      startTime: formatClock(session.startMinute),
      endTime: formatClock(session.endMinute),
      enabled: session.enabled,
      status: assessed?.status ?? null,
      maxAmountRial: session.maxAmountRial?.toFixed(2) ?? null,
      minAmountRial: session.minAmountRial?.toFixed(2) ?? null,
      maxWeightGrams: session.maxWeightGrams?.toFixed(6) ?? null,
      minWeightGrams: session.minWeightGrams?.toFixed(6) ?? null,
      maxCount: session.maxCount,
      maxSingleAmountRial: session.maxSingleAmountRial?.toFixed(2) ?? null,
      maxSingleWeightGrams: session.maxSingleWeightGrams?.toFixed(6) ?? null,
      usedAmountRial: usage ? usage.amountRial.toFixed(2) : null,
      usedWeightGrams: usage ? usage.weightGrams.toFixed(6) : null,
      usedCount: usage ? usage.count : null,
      remainingAmountRial: usage
        ? (remainingOf(session.maxAmountRial, usage.amountRial)?.toFixed(2) ?? null)
        : null,
      remainingWeightGrams: usage
        ? (remainingOf(session.maxWeightGrams, usage.weightGrams)?.toFixed(6) ?? null)
        : null,
      remainingCount:
        usage && session.maxCount != null ? Math.max(0, session.maxCount - usage.count) : null,
      amountPercent: usage ? percentOf(usage.amountRial, session.maxAmountRial) : null,
      weightPercent: usage ? percentOf(usage.weightGrams, session.maxWeightGrams) : null,
      countPercent:
        usage && session.maxCount != null
          ? percentOf(new Decimal(usage.count), new Decimal(session.maxCount))
          : null,
    };
  }

  private overridePayload(override: {
    id: string;
    date: string;
    kind: TradingOverrideKind;
    title: string;
    enabled: boolean;
    sessions: SessionView[];
  }) {
    return {
      id: override.id,
      date: override.date,
      kind: override.kind,
      title: override.title,
      enabled: override.enabled,
      sessions: override.sessions.map((session) => this.sessionPayload(session)),
    };
  }

  private summary(
    sessions: Array<{
      session: SessionView;
      usage: { count: number; amountRial: Decimal; weightGrams: Decimal };
    }>,
  ) {
    const usedCount = sessions.reduce((sum, item) => sum + item.usage.count, 0);
    const usedAmount = sessions.reduce(
      (sum, item) => sum.plus(item.usage.amountRial),
      new Decimal(0),
    );
    const usedWeight = sessions.reduce(
      (sum, item) => sum.plus(item.usage.weightGrams),
      new Decimal(0),
    );
    return {
      count: countMeter(usedCount, sumNumbers(sessions.map((item) => item.session.maxCount))),
      weight: meter(
        usedWeight,
        sumDecimals(sessions.map((item) => item.session.maxWeightGrams)),
        6,
      ),
      amount: meter(usedAmount, sumDecimals(sessions.map((item) => item.session.maxAmountRial)), 2),
    };
  }

  private async requireSession(id: string): Promise<SessionView> {
    const session = await this.repo.findSession(id);
    if (!session) throw new NotFoundException('بازه معاملاتی پیدا نشد.');
    return session;
  }

  private async requireOverride(id: string) {
    const override = await this.repo.findOverrideById(id);
    if (!override) throw new NotFoundException('تعطیلی یا استثنا پیدا نشد.');
    return override;
  }

  private requireClock(value: string | undefined): number {
    const minute = value ? parseClock(value) : null;
    if (minute == null) {
      throw new BusinessRuleException('TRADING_TIME_RANGE', TRADING_MESSAGES.invalidTime);
    }
    return minute;
  }

  private requireTitle(value: string, message: string): string {
    const title = value?.trim();
    if (!title) throw new BusinessRuleException('TRADING_TITLE', message);
    return title;
  }

  private assertDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BusinessRuleException('TRADING_DATE', 'تاریخ نامعتبر است.');
    }
  }

  private dateRange(from: string | undefined, to: string | undefined, today: string) {
    const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : today;
    const end = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : today;
    if (start > end) {
      throw new BusinessRuleException('TRADING_DATE', 'بازه تاریخ نامعتبر است.');
    }
    return { from: start, to: end };
  }
}

function mergeDecimal(
  incoming: string | null | undefined,
  current: Decimal | null,
  scale: number,
): Decimal | null {
  if (incoming === undefined) return current;
  if (incoming === null || incoming === '') return null;
  let parsed: Decimal;
  try {
    parsed = new Decimal(incoming);
  } catch {
    throw new BusinessRuleException('TRADING_LIMIT_VALUE', TRADING_MESSAGES.invalidNumber);
  }
  if (!parsed.isFinite()) {
    throw new BusinessRuleException('TRADING_LIMIT_VALUE', TRADING_MESSAGES.invalidNumber);
  }
  return parsed.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}

function mergeCount(incoming: number | null | undefined, current: number | null): number | null {
  if (incoming === undefined) return current;
  if (incoming === null) return null;
  if (!Number.isInteger(incoming)) {
    throw new BusinessRuleException('TRADING_LIMIT_VALUE', TRADING_MESSAGES.invalidNumber);
  }
  return incoming;
}

function meter(used: Decimal, max: Decimal | null, scale: number) {
  const remaining = remainingOf(max, used);
  return {
    used: used.toFixed(scale),
    max: max?.toFixed(scale) ?? null,
    remaining: remaining?.toFixed(scale) ?? null,
    percent: percentOf(used, max),
  };
}

function countMeter(used: number, max: number | null) {
  return {
    used,
    max,
    remaining: max == null ? null : Math.max(0, max - used),
    percent: max == null ? null : percentOf(new Decimal(used), new Decimal(max)),
  };
}

function sumDecimals(values: Array<Decimal | null>): Decimal | null {
  const present = values.filter((value): value is Decimal => value != null);
  if (present.length === 0) return null;
  return present.reduce((sum, value) => sum.plus(value), new Decimal(0));
}

function sumNumbers(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null);
  if (present.length === 0) return null;
  return present.reduce((sum, value) => sum + value, 0);
}

function snapshotSession(session: SessionView): Record<string, unknown> {
  return {
    title: session.title,
    weekday: session.weekday,
    dayOverrideId: session.dayOverrideId,
    startTime: formatClock(session.startMinute),
    endTime: formatClock(session.endMinute),
    enabled: session.enabled,
    maxAmountRial: session.maxAmountRial?.toFixed(2) ?? null,
    minAmountRial: session.minAmountRial?.toFixed(2) ?? null,
    maxWeightGrams: session.maxWeightGrams?.toFixed(6) ?? null,
    minWeightGrams: session.minWeightGrams?.toFixed(6) ?? null,
    maxCount: session.maxCount,
    maxSingleAmountRial: session.maxSingleAmountRial?.toFixed(2) ?? null,
    maxSingleWeightGrams: session.maxSingleWeightGrams?.toFixed(6) ?? null,
  };
}

function snapshotLimit(limit: LimitView): Record<string, unknown> {
  return {
    id: limit.id,
    scope: limit.scope,
    scopeKey: limit.scopeKey,
    enabled: limit.enabled,
    maxAmountRial: limit.maxAmountRial?.toFixed(2) ?? null,
    maxWeightGrams: limit.maxWeightGrams?.toFixed(6) ?? null,
    maxCount: limit.maxCount,
  };
}

function snapshotOverride(override: {
  id: string;
  date: string;
  kind: string;
  title: string;
  enabled: boolean;
  sessions: SessionView[];
}): Record<string, unknown> {
  return {
    id: override.id,
    date: override.date,
    kind: override.kind,
    title: override.title,
    enabled: override.enabled,
    sessions: override.sessions.map(snapshotSession),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
