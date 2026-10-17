import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { BusinessRuleException } from '../../../common/exceptions/business-rule.exception';
import { AuditService } from '../../audit/application/audit.service';
import { hashRefreshToken } from '../../auth/domain/refresh-token.hash';
import { parseUserAgent } from '../domain/parse-user-agent';
import { generateSessionSecret } from '../domain/session-secret';
import {
  decideAdmission,
  GLOBAL_SESSION_SETTING_ID,
  resolveEffectivePolicy,
  SESSION_CONFIRMATION_MESSAGE,
  SESSION_LIMIT_REACHED_MESSAGE,
  type EffectiveSessionPolicy,
  type PolicyFields,
  type SessionLoginBehavior,
  type SessionLimitType,
  type StoredRolePolicy,
  type StoredUserPolicy,
} from '../domain/session-policy';
import {
  clampRefreshExpiresAt,
  evaluateSessionTimeLimits,
  type GlobalSessionTimeLimits,
  type SessionTimeLimitReason,
} from '../domain/session-time-policy';

const ACTIVITY_TOUCH_MS = 5 * 60 * 1000;
const CONFIRMATION_TTL_MS = 2 * 60 * 1000;
/** Interactive login txs take a user lock plus several reads; Prisma's 5s default is too tight. */
const SESSION_TX = { maxWait: 10_000, timeout: 15_000 } as const;

export interface SessionView {
  id: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  device: string;
  browser: string;
  os: string;
  current: boolean;
  status: 'ACTIVE';
}

export interface OpenSessionInput {
  userId: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

type Tx = Prisma.TransactionClient;

type TimeLimitRevocation = {
  sessionId: string;
  userId: string;
  reason: SessionTimeLimitReason;
};

@Injectable()
export class SessionEnforcementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async openLoginSession(
    input: OpenSessionInput,
  ): Promise<{ sessionId: string; refreshToken: string }> {
    const limits = await this.readGlobalTimeLimits();
    const outcome = await this.sessionTx((tx) => this.admit(tx, input, limits));
    await this.auditTimeLimitRevocations(outcome.timeLimitRevocations);

    if (outcome.kind === 'blocked') {
      await this.auditService.log({
        actorId: input.userId,
        action: 'LOGIN_BLOCKED_SESSION_LIMIT',
        entityType: 'User',
        entityId: input.userId,
        ipAddress: input.ipAddress ?? undefined,
        after: { behavior: 'BLOCK', maxSessions: outcome.policy.maxSessions },
      });
      throw new BusinessRuleException('SESSION_LIMIT_REACHED', SESSION_LIMIT_REACHED_MESSAGE, {
        confirmationToken: outcome.confirmationToken,
      });
    }

    if (outcome.kind === 'confirmation') {
      await this.auditService.log({
        actorId: input.userId,
        action: 'LOGIN_BLOCKED_SESSION_LIMIT',
        entityType: 'User',
        entityId: input.userId,
        ipAddress: input.ipAddress ?? undefined,
        after: {
          behavior: 'REQUIRE_CONFIRMATION',
          sessionIds: outcome.sessions.map((session) => session.id),
        },
      });
      throw new BusinessRuleException(
        'SESSION_LIMIT_CONFIRMATION_REQUIRED',
        SESSION_CONFIRMATION_MESSAGE,
        {
          confirmationToken: outcome.confirmationToken,
          sessions: outcome.sessions,
        },
      );
    }

    await this.auditCreated(input, outcome.sessionId, outcome.revokedIds);
    return { sessionId: outcome.sessionId, refreshToken: outcome.refreshToken };
  }

  async confirmLoginSession(input: {
    confirmationToken: string;
    revokeSessionId: string;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<{ userId: string; sessionId: string; refreshToken: string }> {
    const tokenHash = hashRefreshToken(input.confirmationToken);
    const limits = await this.readGlobalTimeLimits();
    const outcome = await this.sessionTx(async (tx) => {
      const ticket = await tx.loginConfirmation.findUnique({ where: { tokenHash } });
      if (!ticket || ticket.usedAt || ticket.expiresAt <= new Date()) {
        throw new UnauthorizedException('تأیید ورود منقضی یا نامعتبر است. دوباره وارد شوید.');
      }
      await this.lockUser(tx, ticket.userId);
      const policy = await this.loadPolicy(tx, ticket.userId);
      const chosen = await tx.refreshToken.findFirst({
        where: {
          id: input.revokeSessionId,
          userId: ticket.userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!chosen) throw new NotFoundException('نشست انتخاب‌شده فعال نیست.');

      await tx.refreshToken.update({
        where: { id: chosen.id },
        data: { revokedAt: new Date() },
      });
      const { live: active, revoked: timeLimitRevocations } = await this.listActive(
        tx,
        ticket.userId,
        limits,
      );
      const decision = decideAdmission(active, policy);
      if (decision.type === 'block' || decision.type === 'confirm') {
        throw new BusinessRuleException('SESSION_LIMIT_REACHED', SESSION_LIMIT_REACHED_MESSAGE);
      }
      if (decision.type === 'revoke') {
        await tx.refreshToken.updateMany({
          where: { id: { in: decision.sessionIds } },
          data: { revokedAt: new Date() },
        });
      }
      const created = await this.insertSession(
        tx,
        {
          userId: ticket.userId,
          expiresAt: input.expiresAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
        limits,
      );
      await tx.loginConfirmation.update({
        where: { id: ticket.id },
        data: { usedAt: new Date() },
      });
      return {
        userId: ticket.userId,
        sessionId: created.sessionId,
        refreshToken: created.refreshToken,
        revokedIds: [chosen.id, ...(decision.type === 'revoke' ? decision.sessionIds : [])],
        timeLimitRevocations,
      };
    });
    await this.auditTimeLimitRevocations(outcome.timeLimitRevocations);

    await this.auditCreated(
      {
        userId: outcome.userId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        expiresAt: input.expiresAt,
      },
      outcome.sessionId,
      outcome.revokedIds,
    );
    return {
      userId: outcome.userId,
      sessionId: outcome.sessionId,
      refreshToken: outcome.refreshToken,
    };
  }

  /**
   * Completes a blocked login by closing every other active session.
   * The confirmation token exists only after OTP has already succeeded.
   */
  async confirmLoginByClosingOthers(input: {
    confirmationToken: string;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<{ userId: string; sessionId: string; refreshToken: string }> {
    const tokenHash = hashRefreshToken(input.confirmationToken);
    const limits = await this.readGlobalTimeLimits();
    const outcome = await this.sessionTx(async (tx) => {
      const ticket = await tx.loginConfirmation.findUnique({ where: { tokenHash } });
      if (!ticket || ticket.usedAt || ticket.expiresAt <= new Date()) {
        throw new UnauthorizedException('تأیید ورود منقضی یا نامعتبر است. دوباره وارد شوید.');
      }
      await this.lockUser(tx, ticket.userId);
      const { live: active, revoked: timeLimitRevocations } = await this.listActive(
        tx,
        ticket.userId,
        limits,
      );
      if (active.length > 0) {
        await tx.refreshToken.updateMany({
          where: { id: { in: active.map((session) => session.id) }, userId: ticket.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      const created = await this.insertSession(
        tx,
        {
          userId: ticket.userId,
          expiresAt: input.expiresAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
        limits,
      );
      await tx.loginConfirmation.update({
        where: { id: ticket.id },
        data: { usedAt: new Date() },
      });
      return {
        userId: ticket.userId,
        sessionId: created.sessionId,
        refreshToken: created.refreshToken,
        revokedIds: active.map((session) => session.id),
        timeLimitRevocations,
      };
    });
    await this.auditTimeLimitRevocations(outcome.timeLimitRevocations);

    await this.auditCreated(
      {
        userId: outcome.userId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        expiresAt: input.expiresAt,
      },
      outcome.sessionId,
      outcome.revokedIds,
    );
    return {
      userId: outcome.userId,
      sessionId: outcome.sessionId,
      refreshToken: outcome.refreshToken,
    };
  }

  /**
   * Replaces the refresh secret on the same session row.
   * Rotation must not consume an extra concurrent-session slot.
   */
  async rotateRefreshToken(input: {
    sessionId: string;
    userId: string;
    expiresAt: Date;
    ipAddress: string | null;
  }): Promise<string> {
    const raw = generateSessionSecret();
    const tokenHash = hashRefreshToken(raw);
    const limits = await this.readGlobalTimeLimits();
    const outcome = await this.sessionTx(async (tx) => {
      await this.lockUser(tx, input.userId);
      const current = await tx.refreshToken.findUnique({ where: { id: input.sessionId } });
      if (
        !current ||
        current.userId !== input.userId ||
        current.revokedAt ||
        current.expiresAt <= new Date()
      ) {
        throw new UnauthorizedException('Refresh token is invalid or expired');
      }
      const timedOut = evaluateSessionTimeLimits(current, limits);
      if (timedOut) {
        await this.markRevoked(tx, current.id);
        return { kind: 'timed_out' as const, reason: timedOut, sessionId: current.id };
      }
      const expiresAt = clampRefreshExpiresAt(
        current.createdAt,
        input.expiresAt,
        limits.maxSessionDurationMinutes,
      );
      if (expiresAt <= new Date()) {
        await this.markRevoked(tx, current.id);
        return { kind: 'timed_out' as const, reason: 'max_duration' as const, sessionId: current.id };
      }
      await tx.refreshToken.update({
        where: { id: current.id },
        data: {
          tokenHash,
          expiresAt,
          lastActivityAt: new Date(),
          ipAddress: input.ipAddress ?? current.ipAddress,
        },
      });
      return { kind: 'rotated' as const };
    });
    if (outcome.kind === 'timed_out') {
      await this.auditTimeLimitRevocations([
        { sessionId: outcome.sessionId, userId: input.userId, reason: outcome.reason },
      ]);
      throw this.timeLimitUnauthorized(outcome.reason);
    }
    return raw;
  }

  async assertActive(sessionId: string, userId: string): Promise<void> {
    const session = await this.prisma.refreshToken.findUnique({ where: { id: sessionId } });
    if (
      !session ||
      session.userId !== userId ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('نشست شما پایان یافته یا منقضی شده است. دوباره وارد شوید.');
    }
    const limits = await this.readGlobalTimeLimits();
    const reason = evaluateSessionTimeLimits(session, limits);
    if (reason) {
      await this.prisma.refreshToken.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.auditService.log({
        actorId: userId,
        action: 'SESSION_REVOKED',
        entityType: 'Session',
        entityId: sessionId,
        reason: reason === 'idle' ? 'idle_timeout' : 'max_session_duration',
      });
      throw this.timeLimitUnauthorized(reason);
    }
    const threshold = new Date(Date.now() - ACTIVITY_TOUCH_MS);
    if (session.lastActivityAt < threshold) {
      await this.prisma.refreshToken.updateMany({
        where: { id: sessionId, revokedAt: null, lastActivityAt: { lt: threshold } },
        data: { lastActivityAt: new Date() },
      });
    }
  }

  async listForUser(userId: string, currentSessionId: string | null): Promise<SessionView[]> {
    const rows = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toView(row, currentSessionId));
  }

  async revokeSession(input: {
    actorId: string;
    targetUserId: string;
    sessionId: string;
    currentSessionId: string | null;
    confirm: boolean;
    byAdmin: boolean;
    ipAddress?: string;
  }): Promise<{ revoked: boolean }> {
    if (!input.confirm) {
      throw new BusinessRuleException(
        'SESSION_REVOKE_CONFIRMATION_REQUIRED',
        input.sessionId === input.currentSessionId
          ? 'پایان دادن به نشست دستگاه فعلی نیاز به تأیید دارد.'
          : 'پایان دادن به نشست نیاز به تأیید دارد.',
      );
    }

    const revoked = await this.sessionTx(async (tx) => {
      await this.lockUser(tx, input.targetUserId);
      const session = await tx.refreshToken.findFirst({
        where: { id: input.sessionId, userId: input.targetUserId },
      });
      if (!session) throw new NotFoundException('نشست پیدا نشد.');
      if (session.revokedAt) return false;
      await tx.refreshToken.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      return true;
    });

    if (revoked) {
      const adminActing = input.byAdmin && input.actorId !== input.targetUserId;
      await this.auditService.log({
        actorId: input.actorId,
        action: adminActing ? 'SESSION_REVOKED_BY_ADMIN' : 'SESSION_REVOKED',
        entityType: 'Session',
        entityId: input.sessionId,
        ipAddress: input.ipAddress,
        after: { userId: input.targetUserId },
      });
    }
    return { revoked };
  }

  async revokeOtherSessions(input: {
    actorId: string;
    targetUserId: string;
    keepSessionId: string | null;
    confirm: boolean;
    ipAddress?: string;
  }): Promise<{ revokedCount: number }> {
    if (!input.confirm) {
      throw new BusinessRuleException(
        'SESSION_REVOKE_CONFIRMATION_REQUIRED',
        'پایان دادن به سایر نشست‌ها نیاز به تأیید دارد.',
      );
    }

    const revokedCount = await this.sessionTx(async (tx) => {
      await this.lockUser(tx, input.targetUserId);
      const result = await tx.refreshToken.updateMany({
        where: {
          userId: input.targetUserId,
          revokedAt: null,
          ...(input.keepSessionId ? { id: { not: input.keepSessionId } } : {}),
        },
        data: { revokedAt: new Date() },
      });
      return result.count;
    });

    await this.auditService.log({
      actorId: input.actorId,
      action: 'ALL_OTHER_SESSIONS_REVOKED',
      entityType: 'User',
      entityId: input.targetUserId,
      ipAddress: input.ipAddress,
      after: { revokedCount, keepSessionId: input.keepSessionId },
    });
    return { revokedCount };
  }

  async resolveForUser(userId: string): Promise<EffectiveSessionPolicy> {
    return this.sessionTx((tx) => this.loadPolicy(tx, userId));
  }

  private sessionTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, SESSION_TX);
  }

  private async admit(tx: Tx, input: OpenSessionInput, limits: GlobalSessionTimeLimits) {
    await this.lockUser(tx, input.userId);
    const policy = await this.loadPolicy(tx, input.userId);
    const { live: active, revoked: timeLimitRevocations } = await this.listActive(
      tx,
      input.userId,
      limits,
    );
    const decision = decideAdmission(active, policy);

    if (decision.type === 'block') {
      const confirmationToken = await this.issueConfirmation(tx, input);
      return { kind: 'blocked' as const, policy, confirmationToken, timeLimitRevocations };
    }

    if (decision.type === 'confirm') {
      const confirmationToken = await this.issueConfirmation(tx, input);
      return {
        kind: 'confirmation' as const,
        confirmationToken,
        sessions: active.map((session) => this.toView(session, null)),
        timeLimitRevocations,
      };
    }

    const revokedIds = decision.type === 'revoke' ? decision.sessionIds : [];
    if (revokedIds.length > 0) {
      await tx.refreshToken.updateMany({
        where: { id: { in: revokedIds }, userId: input.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    const created = await this.insertSession(tx, input, limits);
    return { kind: 'created' as const, ...created, revokedIds, timeLimitRevocations };
  }

  private async issueConfirmation(tx: Tx, input: OpenSessionInput): Promise<string> {
    const confirmationToken = generateSessionSecret();
    await tx.loginConfirmation.updateMany({
      where: { userId: input.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.loginConfirmation.create({
      data: {
        userId: input.userId,
        tokenHash: hashRefreshToken(confirmationToken),
        expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS),
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
    return confirmationToken;
  }

  private async insertSession(tx: Tx, input: OpenSessionInput, limits: GlobalSessionTimeLimits) {
    const refreshToken = generateSessionSecret();
    const device = parseUserAgent(input.userAgent);
    const createdAt = new Date();
    const expiresAt = clampRefreshExpiresAt(
      createdAt,
      input.expiresAt,
      limits.maxSessionDurationMinutes,
    );
    const created = await tx.refreshToken.create({
      data: {
        userId: input.userId,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        deviceName: device.deviceName,
        browser: device.browser,
        os: device.os,
        lastActivityAt: new Date(),
      },
      select: { id: true },
    });
    return { sessionId: created.id, refreshToken };
  }

  private async listActive(tx: Tx, userId: string, limits: GlobalSessionTimeLimits) {
    const rows = await tx.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    });
    return this.reconcileTimedOutSessions(tx, rows, limits, userId);
  }

  private async readGlobalTimeLimits(): Promise<GlobalSessionTimeLimits> {
    const row = await this.prisma.sessionSetting.findUnique({
      where: { id: GLOBAL_SESSION_SETTING_ID },
    });
    return {
      idleTimeoutMinutes: row?.idleTimeoutMinutes ?? null,
      maxSessionDurationMinutes: row?.maxSessionDurationMinutes ?? null,
    };
  }

  private timeLimitUnauthorized(reason: SessionTimeLimitReason): UnauthorizedException {
    if (reason === 'idle') {
      return new UnauthorizedException(
        'به‌دلیل عدم فعالیت، نشست شما پایان یافت. دوباره وارد شوید.',
      );
    }
    return new UnauthorizedException(
      'حداکثر مدت نشست از زمان ورود به پایان رسید. دوباره وارد شوید.',
    );
  }

  private async markRevoked(tx: Tx, sessionId: string): Promise<void> {
    await tx.refreshToken.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async auditTimeLimitRevocations(revocations: TimeLimitRevocation[]): Promise<void> {
    for (const item of revocations) {
      await this.auditService.log({
        actorId: item.userId,
        action: 'SESSION_REVOKED',
        entityType: 'Session',
        entityId: item.sessionId,
        reason: item.reason === 'idle' ? 'idle_timeout' : 'max_session_duration',
      });
    }
  }

  private async reconcileTimedOutSessions<T extends { id: string; userId: string; createdAt: Date; lastActivityAt: Date }>(
    tx: Tx,
    rows: T[],
    limits: GlobalSessionTimeLimits,
    userId: string,
  ): Promise<{ live: T[]; revoked: TimeLimitRevocation[] }> {
    const now = new Date();
    const live: T[] = [];
    const revoked: TimeLimitRevocation[] = [];
    for (const row of rows) {
      const reason = evaluateSessionTimeLimits(row, limits, now);
      if (reason) {
        revoked.push({ sessionId: row.id, userId, reason });
      } else {
        live.push(row);
      }
    }
    if (revoked.length > 0) {
      await tx.refreshToken.updateMany({
        where: { id: { in: revoked.map((item) => item.sessionId) }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { live, revoked };
  }

  private async loadPolicy(tx: Tx, userId: string): Promise<EffectiveSessionPolicy> {
    const [userPolicy, user, global] = await Promise.all([
      tx.userSessionPolicy.findUnique({ where: { userId } }),
      tx.user.findUnique({
        where: { id: userId },
        select: { roles: { select: { roleId: true } } },
      }),
      tx.sessionSetting.findUnique({ where: { id: GLOBAL_SESSION_SETTING_ID } }),
    ]);

    const roleIds = user?.roles.map((role) => role.roleId) ?? [];
    const roleRows = roleIds.length
      ? await tx.roleSessionPolicy.findMany({ where: { roleId: { in: roleIds } } })
      : [];

    const roles: StoredRolePolicy[] = roleIds.map((roleId) => {
      const row = roleRows.find((policy) => policy.roleId === roleId);
      if (!row || row.useDefault) {
        return { useDefault: true, limitType: null, maxSessions: null, loginBehavior: null };
      }
      return {
        useDefault: false,
        limitType: row.limitType,
        maxSessions: row.maxSessions,
        loginBehavior: row.loginBehavior,
      };
    });

    const storedUser: StoredUserPolicy | null = userPolicy
      ? {
          mode: userPolicy.mode,
          limitType: userPolicy.limitType,
          maxSessions: userPolicy.maxSessions,
          loginBehavior: userPolicy.loginBehavior,
        }
      : null;

    const fallback: PolicyFields = {
      limitType: 'LIMITED',
      maxSessions: 1,
      loginBehavior: 'BLOCK',
    };

    return resolveEffectivePolicy({
      user: storedUser,
      roles,
      global: global
        ? {
            limitType: global.limitType as SessionLimitType,
            maxSessions: global.maxSessions,
            loginBehavior: global.loginBehavior as SessionLoginBehavior,
          }
        : fallback,
    });
  }

  private async lockUser(tx: Tx, userId: string): Promise<void> {
    await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  }

  private toView(
    row: {
      id: string;
      createdAt: Date;
      lastActivityAt: Date;
      expiresAt: Date;
      ipAddress: string | null;
      userAgent: string | null;
      deviceName: string | null;
      browser: string | null;
      os: string | null;
    },
    currentSessionId: string | null,
  ): SessionView {
    const parsed = parseUserAgent(row.userAgent);
    return {
      id: row.id,
      createdAt: row.createdAt,
      lastActivityAt: row.lastActivityAt,
      expiresAt: row.expiresAt,
      ipAddress: row.ipAddress,
      device: row.deviceName ?? parsed.deviceName,
      browser: row.browser ?? parsed.browser,
      os: row.os ?? parsed.os,
      current: row.id === currentSessionId,
      status: 'ACTIVE',
    };
  }

  private async auditCreated(input: OpenSessionInput, sessionId: string, revokedIds: string[]) {
    for (const revokedId of revokedIds) {
      await this.auditService.log({
        actorId: input.userId,
        action: 'SESSION_REVOKED',
        entityType: 'Session',
        entityId: revokedId,
        ipAddress: input.ipAddress ?? undefined,
        reason: 'session_limit',
      });
    }
    await this.auditService.log({
      actorId: input.userId,
      action: 'SESSION_CREATED',
      entityType: 'Session',
      entityId: sessionId,
      ipAddress: input.ipAddress ?? undefined,
      after: { userId: input.userId },
    });
  }
}

export function assertCanManageSessions(
  permissions: readonly string[],
  scope: 'settings' | 'user',
): void {
  if (scope === 'settings') {
    if (!permissions.includes('session.policy.manage')) {
      throw new ForbiddenException('Insufficient permissions. Required: session.policy.manage');
    }
    return;
  }
  if (!permissions.includes('session.policy.manage') && !permissions.includes('user.manage')) {
    throw new ForbiddenException(
      'Insufficient permissions. Required: session.policy.manage or user.manage',
    );
  }
}
