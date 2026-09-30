import { Injectable } from '@nestjs/common';
import { Prisma, TradeStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../database/prisma.service';
import { dateKeyToUtcDate, utcDateToKey } from '../domain/trading-time';
import {
  CapFields,
  LimitView,
  OverrideView,
  SessionView,
  TradingLimitScope,
  TradingOverrideKind,
  TradingWeekday,
  Usage,
} from '../domain/trading.types';

const CONSUMING_TRADE_STATUSES: TradeStatus[] = [
  TradeStatus.CONFIRMED,
  TradeStatus.SETTLING,
  TradeStatus.COMPLETED,
];

export const TRADING_AUDIT_ENTITIES = [
  'TradingSchedule',
  'TradingSession',
  'TradingDayOverride',
  'TradingLimit',
] as const;

export interface SessionWrite extends CapFields {
  title: string;
  weekday: TradingWeekday | null;
  dayOverrideId: string | null;
  startMinute: number;
  endMinute: number;
  enabled: boolean;
  sortOrder: number;
}

type SessionRow = {
  id: string;
  weekday: TradingWeekday | null;
  dayOverrideId: string | null;
  title: string;
  startMinute: number;
  endMinute: number;
  enabled: boolean;
  sortOrder: number;
  maxAmountRial: Prisma.Decimal | null;
  minAmountRial: Prisma.Decimal | null;
  maxWeightGrams: Prisma.Decimal | null;
  minWeightGrams: Prisma.Decimal | null;
  maxCount: number | null;
  maxSingleAmountRial: Prisma.Decimal | null;
  maxSingleWeightGrams: Prisma.Decimal | null;
};

function dec(value: Prisma.Decimal | null): Decimal | null {
  return value == null ? null : new Decimal(value.toString());
}

function money(value: Decimal | null): string | null {
  return value == null ? null : value.toFixed(2);
}

function weight(value: Decimal | null): string | null {
  return value == null ? null : value.toFixed(6);
}

function capData(caps: CapFields) {
  return {
    maxAmountRial: money(caps.maxAmountRial),
    minAmountRial: money(caps.minAmountRial),
    maxWeightGrams: weight(caps.maxWeightGrams),
    minWeightGrams: weight(caps.minWeightGrams),
    maxCount: caps.maxCount,
    maxSingleAmountRial: money(caps.maxSingleAmountRial),
    maxSingleWeightGrams: weight(caps.maxSingleWeightGrams),
  };
}

function toCaps(row: {
  maxAmountRial: Prisma.Decimal | null;
  minAmountRial: Prisma.Decimal | null;
  maxWeightGrams: Prisma.Decimal | null;
  minWeightGrams: Prisma.Decimal | null;
  maxCount: number | null;
  maxSingleAmountRial: Prisma.Decimal | null;
  maxSingleWeightGrams: Prisma.Decimal | null;
}): CapFields {
  return {
    maxAmountRial: dec(row.maxAmountRial),
    minAmountRial: dec(row.minAmountRial),
    maxWeightGrams: dec(row.maxWeightGrams),
    minWeightGrams: dec(row.minWeightGrams),
    maxCount: row.maxCount,
    maxSingleAmountRial: dec(row.maxSingleAmountRial),
    maxSingleWeightGrams: dec(row.maxSingleWeightGrams),
  };
}

function toSession(row: SessionRow): SessionView {
  return {
    id: row.id,
    weekday: row.weekday,
    dayOverrideId: row.dayOverrideId,
    title: row.title,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    ...toCaps(row),
  };
}

function toLimit(row: {
  id: string;
  scope: TradingLimitScope;
  scopeKey: string | null;
  sessionId: string | null;
  enabled: boolean;
  maxAmountRial: Prisma.Decimal | null;
  minAmountRial: Prisma.Decimal | null;
  maxWeightGrams: Prisma.Decimal | null;
  minWeightGrams: Prisma.Decimal | null;
  maxCount: number | null;
  maxSingleAmountRial: Prisma.Decimal | null;
  maxSingleWeightGrams: Prisma.Decimal | null;
}): LimitView {
  return {
    id: row.id,
    scope: row.scope,
    scopeKey: row.scopeKey,
    sessionId: row.sessionId,
    enabled: row.enabled,
    ...toCaps(row),
  };
}

@Injectable()
export class TradingRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Prisma.TransactionClient): PrismaService | Prisma.TransactionClient {
    return tx ?? this.prisma;
  }

  async ensureSchedule(): Promise<{ id: string; enabled: boolean; timezone: string }> {
    return this.prisma.tradingSchedule.upsert({
      where: { id: 'global' },
      update: {},
      create: { id: 'global', timezone: 'Asia/Tehran', enabled: true },
    });
  }

  async setScheduleEnabled(
    enabled: boolean,
  ): Promise<{ id: string; enabled: boolean; timezone: string }> {
    await this.ensureSchedule();
    return this.prisma.tradingSchedule.update({
      where: { id: 'global' },
      data: { enabled },
    });
  }

  async findOverrideByDateKey(dateKey: string): Promise<OverrideView | null> {
    const row = await this.prisma.tradingDayOverride.findUnique({
      where: { date: dateKeyToUtcDate(dateKey) },
      include: {
        sessions: { orderBy: [{ sortOrder: 'asc' }, { startMinute: 'asc' }] },
      },
    });
    return row ? this.toOverride(row) : null;
  }

  async findOverrideById(id: string): Promise<OverrideView | null> {
    const row = await this.prisma.tradingDayOverride.findUnique({
      where: { id },
      include: {
        sessions: { orderBy: [{ sortOrder: 'asc' }, { startMinute: 'asc' }] },
      },
    });
    return row ? this.toOverride(row) : null;
  }

  async listOverrides(from: string, to: string): Promise<OverrideView[]> {
    const rows = await this.prisma.tradingDayOverride.findMany({
      where: {
        date: { gte: dateKeyToUtcDate(from), lte: dateKeyToUtcDate(to) },
      },
      include: {
        sessions: { orderBy: [{ sortOrder: 'asc' }, { startMinute: 'asc' }] },
      },
      orderBy: { date: 'asc' },
    });
    return rows.map((row) => this.toOverride(row));
  }

  async listWeekly(weekday?: TradingWeekday): Promise<SessionView[]> {
    const rows = await this.prisma.tradingSession.findMany({
      where: {
        dayOverrideId: null,
        ...(weekday ? { weekday } : {}),
      },
      orderBy: [{ weekday: 'asc' }, { sortOrder: 'asc' }, { startMinute: 'asc' }],
    });
    return rows.map(toSession);
  }

  async findSession(id: string): Promise<SessionView | null> {
    const row = await this.prisma.tradingSession.findUnique({ where: { id } });
    return row ? toSession(row) : null;
  }

  async laneSessions(lane: {
    weekday?: TradingWeekday | null;
    dayOverrideId?: string | null;
  }): Promise<SessionView[]> {
    if (lane.dayOverrideId) {
      const rows = await this.prisma.tradingSession.findMany({
        where: { dayOverrideId: lane.dayOverrideId },
        orderBy: { startMinute: 'asc' },
      });
      return rows.map(toSession);
    }
    if (!lane.weekday) return [];
    return this.listWeekly(lane.weekday);
  }

  async createSession(input: SessionWrite): Promise<SessionView> {
    const row = await this.prisma.tradingSession.create({
      data: {
        scheduleId: 'global',
        title: input.title,
        weekday: input.weekday,
        dayOverrideId: input.dayOverrideId,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        enabled: input.enabled,
        sortOrder: input.sortOrder,
        ...capData(input),
      },
    });
    return toSession(row);
  }

  async updateSession(id: string, input: SessionWrite): Promise<SessionView> {
    const row = await this.prisma.tradingSession.update({
      where: { id },
      data: {
        title: input.title,
        weekday: input.weekday,
        dayOverrideId: input.dayOverrideId,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        enabled: input.enabled,
        sortOrder: input.sortOrder,
        ...capData(input),
      },
    });
    return toSession(row);
  }

  async deleteSession(id: string): Promise<void> {
    await this.prisma.tradingSession.delete({ where: { id } });
  }

  async createOverride(input: {
    date: string;
    kind: TradingOverrideKind;
    title: string;
    enabled: boolean;
  }): Promise<OverrideView> {
    const row = await this.prisma.tradingDayOverride.create({
      data: {
        date: dateKeyToUtcDate(input.date),
        kind: input.kind,
        title: input.title,
        enabled: input.enabled,
      },
      include: { sessions: true },
    });
    return this.toOverride(row);
  }

  async updateOverride(
    id: string,
    input: { kind: TradingOverrideKind; title: string; enabled: boolean; date: string },
  ): Promise<OverrideView> {
    const row = await this.prisma.tradingDayOverride.update({
      where: { id },
      data: {
        date: dateKeyToUtcDate(input.date),
        kind: input.kind,
        title: input.title,
        enabled: input.enabled,
      },
      include: {
        sessions: { orderBy: [{ sortOrder: 'asc' }, { startMinute: 'asc' }] },
      },
    });
    return this.toOverride(row);
  }

  async deleteOverride(id: string): Promise<void> {
    await this.prisma.tradingDayOverride.delete({ where: { id } });
  }

  async limitsForSessions(
    sessionIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<LimitView[]> {
    if (sessionIds.length === 0) return [];
    const rows = await this.db(tx).tradingLimit.findMany({
      where: { sessionId: { in: sessionIds } },
    });
    return rows.map(toLimit);
  }

  async syncGlobalLimit(session: SessionView): Promise<LimitView> {
    const existing = await this.prisma.tradingLimit.findFirst({
      where: { sessionId: session.id, scope: 'GLOBAL', scopeKey: null },
    });
    const data = {
      scope: 'GLOBAL' as const,
      scopeKey: null,
      sessionId: session.id,
      enabled: true,
      ...capData(session),
    };
    const row = existing
      ? await this.prisma.tradingLimit.update({ where: { id: existing.id }, data })
      : await this.prisma.tradingLimit.create({ data });
    return toLimit(row);
  }

  async upsertScopedLimit(input: {
    sessionId: string | null;
    scope: TradingLimitScope;
    scopeKey: string | null;
    enabled: boolean;
    caps: CapFields;
  }): Promise<{ limit: LimitView; previous: LimitView | null }> {
    const existing = await this.prisma.tradingLimit.findFirst({
      where: {
        sessionId: input.sessionId,
        scope: input.scope,
        scopeKey: input.scopeKey,
      },
    });
    const data = {
      scope: input.scope,
      scopeKey: input.scopeKey,
      sessionId: input.sessionId,
      enabled: input.enabled,
      ...capData(input.caps),
    };
    const row = existing
      ? await this.prisma.tradingLimit.update({ where: { id: existing.id }, data })
      : await this.prisma.tradingLimit.create({ data });
    return { limit: toLimit(row), previous: existing ? toLimit(existing) : null };
  }

  async usageBetween(start: Date, end: Date, tx?: Prisma.TransactionClient): Promise<Usage> {
    const aggregate = await this.db(tx).trade.aggregate({
      where: {
        status: { in: CONSUMING_TRADE_STATUSES },
        confirmedAt: { gte: start, lt: end },
      },
      _sum: { totalAmountRial: true, weightGrams: true },
      _count: { _all: true },
    });
    return {
      count: aggregate._count._all,
      amountRial: aggregate._sum.totalAmountRial
        ? new Decimal(aggregate._sum.totalAmountRial.toString())
        : new Decimal(0),
      weightGrams: aggregate._sum.weightGrams
        ? new Decimal(aggregate._sum.weightGrams.toString())
        : new Decimal(0),
    };
  }

  async lockSession(tx: Prisma.TransactionClient, sessionId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM trading_sessions WHERE id = ${sessionId} FOR UPDATE`;
  }

  async roleIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      select: { roleId: true },
    });
    return rows.map((row) => row.roleId);
  }

  async userIdForCustomer(customerId: string): Promise<string | null> {
    const row = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  async listAudit(
    limit: number,
    offset: number,
  ): Promise<{
    total: number;
    items: Array<{
      id: string;
      actorId: string | null;
      actorName: string | null;
      actorMobile: string | null;
      action: string;
      entityType: string;
      entityId: string;
      before: Prisma.JsonValue | null;
      after: Prisma.JsonValue | null;
      timestamp: Date;
    }>;
  }> {
    const where = { entityType: { in: [...TRADING_AUDIT_ENTITIES] } };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: offset,
        take: limit,
        include: { actor: { select: { id: true, name: true, mobile: true } } },
      }),
    ]);
    return {
      total,
      items: rows.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actorName: row.actor?.name ?? null,
        actorMobile: row.actor?.mobile ?? null,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        before: row.before,
        after: row.after,
        timestamp: row.timestamp,
      })),
    };
  }

  private toOverride(row: {
    id: string;
    date: Date;
    kind: TradingOverrideKind;
    title: string;
    enabled: boolean;
    sessions: SessionRow[];
  }): OverrideView {
    return {
      id: row.id,
      date: utcDateToKey(row.date),
      kind: row.kind,
      title: row.title,
      enabled: row.enabled,
      sessions: row.sessions.map(toSession),
    };
  }
}
