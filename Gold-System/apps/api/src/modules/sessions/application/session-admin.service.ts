import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SessionLimitType, SessionLoginBehavior, UserSessionPolicyMode } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { latinMobile } from '../../../common/digits';
import { AuditService } from '../../audit/application/audit.service';
import {
  GLOBAL_SESSION_SETTING_ID,
  isAllowedSessionLimit,
  type SessionLoginBehavior as Behavior,
  type SessionLimitType as LimitType,
} from '../domain/session-policy';
import { SessionEnforcementService } from './session-enforcement.service';

function snapshot(value: object): Record<string, unknown> {
  return { ...value } as Record<string, unknown>;
}

const USER_BEHAVIORS: Behavior[] = ['BLOCK', 'REVOKE_OLDEST'];

export interface SessionPolicyInput {
  limitType: LimitType;
  maxSessions?: number | null;
  loginBehavior: Behavior;
}

@Injectable()
export class SessionAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly sessions: SessionEnforcementService,
  ) {}

  async getGlobal() {
    const row = await this.ensureGlobal();
    return this.presentPolicy(row.limitType, row.maxSessions, row.loginBehavior);
  }

  async updateGlobal(input: SessionPolicyInput, actorId: string, ipAddress?: string) {
    const checked = this.checked(input.limitType, input.maxSessions, input.loginBehavior, true);
    const before = await this.ensureGlobal();
    const data = this.policyData(checked);
    const updated = await this.prisma.sessionSetting.update({
      where: { id: GLOBAL_SESSION_SETTING_ID },
      data: { ...data, updatedById: actorId },
    });
    await this.auditService.log({
      actorId,
      action: 'SESSION_POLICY_CHANGED',
      entityType: 'SessionSetting',
      entityId: GLOBAL_SESSION_SETTING_ID,
      ipAddress,
      before: snapshot(
        this.presentPolicy(before.limitType, before.maxSessions, before.loginBehavior),
      ),
      after: snapshot(
        this.presentPolicy(updated.limitType, updated.maxSessions, updated.loginBehavior),
      ),
    });
    return this.presentPolicy(updated.limitType, updated.maxSessions, updated.loginBehavior);
  }

  async listRolePolicies() {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { sessionPolicy: true },
    });
    return roles.map((role) => ({
      roleId: role.id,
      name: role.name,
      description: role.description,
      useDefault: role.sessionPolicy?.useDefault ?? true,
      limitType: role.sessionPolicy?.useDefault === false ? role.sessionPolicy.limitType : null,
      maxSessions: role.sessionPolicy?.useDefault === false ? role.sessionPolicy.maxSessions : null,
      loginBehavior:
        role.sessionPolicy?.useDefault === false ? role.sessionPolicy.loginBehavior : null,
    }));
  }

  async updateRolePolicy(
    roleId: string,
    input: { useDefault: boolean } & Partial<SessionPolicyInput>,
    actorId: string,
    ipAddress?: string,
  ) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { sessionPolicy: true },
    });
    if (!role) throw new NotFoundException('نقش پیدا نشد.');

    const before = role.sessionPolicy;
    const data = input.useDefault
      ? {
          useDefault: true,
          limitType: null,
          maxSessions: null,
          loginBehavior: null,
          updatedById: actorId,
        }
      : {
          useDefault: false,
          ...this.policyData(this.requireCustom(input)),
          updatedById: actorId,
        };

    const updated = await this.prisma.roleSessionPolicy.upsert({
      where: { roleId },
      create: { roleId, ...data },
      update: data,
    });

    await this.auditService.log({
      actorId,
      action: 'SESSION_POLICY_CHANGED',
      entityType: 'RoleSessionPolicy',
      entityId: roleId,
      ipAddress,
      before: snapshot(
        before
          ? {
              useDefault: before.useDefault,
              limitType: before.limitType,
              maxSessions: before.maxSessions,
              loginBehavior: before.loginBehavior,
            }
          : { useDefault: true },
      ),
      after: snapshot({
        useDefault: updated.useDefault,
        limitType: updated.limitType,
        maxSessions: updated.maxSessions,
        loginBehavior: updated.loginBehavior,
      }),
    });

    return {
      roleId,
      name: role.name,
      description: role.description,
      useDefault: updated.useDefault,
      limitType: updated.useDefault ? null : updated.limitType,
      maxSessions: updated.useDefault ? null : updated.maxSessions,
      loginBehavior: updated.useDefault ? null : updated.loginBehavior,
    };
  }

  async getUserPolicy(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, mobile: true },
    });
    if (!user) throw new NotFoundException('کاربر پیدا نشد.');
    const stored = await this.prisma.userSessionPolicy.findUnique({ where: { userId } });
    const effective = await this.sessions.resolveForUser(userId);
    return {
      user,
      mode: stored?.mode ?? UserSessionPolicyMode.INHERIT,
      limitType: stored?.mode === 'CUSTOM' ? stored.limitType : null,
      maxSessions: stored?.mode === 'CUSTOM' ? stored.maxSessions : null,
      loginBehavior: stored?.mode === 'CUSTOM' ? stored.loginBehavior : null,
      effective,
    };
  }

  async updateUserPolicy(
    userId: string,
    input: { mode: 'INHERIT' | 'CUSTOM' } & Partial<SessionPolicyInput>,
    actorId: string,
    ipAddress?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('کاربر پیدا نشد.');
    const before = await this.prisma.userSessionPolicy.findUnique({ where: { userId } });
    const data =
      input.mode === 'INHERIT'
        ? {
            mode: UserSessionPolicyMode.INHERIT,
            limitType: null,
            maxSessions: null,
            loginBehavior: null,
            updatedById: actorId,
          }
        : {
            mode: UserSessionPolicyMode.CUSTOM,
            ...this.policyData(this.requireCustom(input)),
            updatedById: actorId,
          };

    const updated = await this.prisma.userSessionPolicy.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    await this.auditService.log({
      actorId,
      action: 'USER_SESSION_OVERRIDE_CHANGED',
      entityType: 'UserSessionPolicy',
      entityId: userId,
      ipAddress,
      before: snapshot(
        before
          ? {
              mode: before.mode,
              limitType: before.limitType,
              maxSessions: before.maxSessions,
              loginBehavior: before.loginBehavior,
            }
          : { mode: 'INHERIT' },
      ),
      after: snapshot({
        mode: updated.mode,
        limitType: updated.limitType,
        maxSessions: updated.maxSessions,
        loginBehavior: updated.loginBehavior,
      }),
    });

    return this.getUserPolicy(userId);
  }

  async searchUsers(mobile: string) {
    const normalized = latinMobile(mobile);
    if (normalized.length < 3) return [];
    const users = await this.prisma.user.findMany({
      where: { mobile: { contains: normalized } },
      take: 8,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        mobile: true,
        status: true,
        roles: { select: { role: { select: { id: true, name: true, description: true } } } },
      },
    });
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      status: user.status,
      roles: user.roles.map((link) => link.role),
    }));
  }

  listUserSessions(userId: string, currentSessionId: string | null) {
    return this.sessions.listForUser(userId, currentSessionId);
  }

  private async ensureGlobal() {
    return this.prisma.sessionSetting.upsert({
      where: { id: GLOBAL_SESSION_SETTING_ID },
      create: {
        id: GLOBAL_SESSION_SETTING_ID,
        limitType: SessionLimitType.LIMITED,
        maxSessions: 1,
        loginBehavior: SessionLoginBehavior.BLOCK,
      },
      update: {},
    });
  }

  private requireCustom(input: Partial<SessionPolicyInput>): SessionPolicyInput {
    if (!input.limitType || !input.loginBehavior) {
      throw new BadRequestException('حداکثر نشست و رفتار ورود برای سیاست سفارشی لازم است.');
    }
    return this.checked(input.limitType, input.maxSessions, input.loginBehavior, false);
  }

  private checked(
    limitType: LimitType,
    maxSessions: number | null | undefined,
    loginBehavior: Behavior,
    allowConfirmation: boolean,
  ): SessionPolicyInput {
    const allowed = allowConfirmation
      ? ['BLOCK', 'REVOKE_OLDEST', 'REQUIRE_CONFIRMATION']
      : USER_BEHAVIORS;
    if (!allowed.includes(loginBehavior)) {
      throw new BadRequestException('رفتار ورود انتخاب‌شده مجاز نیست.');
    }
    if (limitType === 'LIMITED' && (maxSessions == null || !isAllowedSessionLimit(maxSessions))) {
      throw new BadRequestException('حداکثر نشست باید ۱، ۲، ۳ یا ۵ باشد.');
    }
    return {
      limitType,
      maxSessions: limitType === 'UNLIMITED' ? null : maxSessions,
      loginBehavior,
    };
  }

  private policyData(input: SessionPolicyInput) {
    return {
      limitType: input.limitType as SessionLimitType,
      maxSessions: input.limitType === 'UNLIMITED' ? null : (input.maxSessions ?? null),
      loginBehavior: input.loginBehavior as SessionLoginBehavior,
    };
  }

  private presentPolicy(
    limitType: SessionLimitType,
    maxSessions: number | null,
    loginBehavior: SessionLoginBehavior,
  ) {
    return { limitType, maxSessions, loginBehavior };
  }
}
