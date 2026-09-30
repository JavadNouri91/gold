import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { BusinessRuleException } from '../../../common/exceptions/business-rule.exception';
import { AuditService } from '../../audit/application/audit.service';
import { PrismaService } from '../../../database/prisma.service';
import { SessionEnforcementService } from './session-enforcement.service';

interface Row {
  id: string;
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  lastActivityAt: Date;
  tokenHash?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceName?: string | null;
  browser?: string | null;
  os?: string | null;
}

function future(hours = 24) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function harness(global: {
  limitType: 'LIMITED' | 'UNLIMITED';
  maxSessions: number | null;
  loginBehavior: 'BLOCK' | 'REVOKE_OLDEST' | 'REQUIRE_CONFIRMATION';
}) {
  const rows: Row[] = [];
  const tickets: Array<{
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
  }> = [];
  let chain: Promise<void> = Promise.resolve();
  let seq = 0;
  const locks = { count: 0 };
  const state: {
    userPolicy: {
      mode: 'INHERIT' | 'CUSTOM';
      limitType: 'LIMITED' | 'UNLIMITED' | null;
      maxSessions: number | null;
      loginBehavior: 'BLOCK' | 'REVOKE_OLDEST' | null;
    } | null;
    roleIds: string[];
    rolePolicies: Array<{
      roleId: string;
      useDefault: boolean;
      limitType: 'LIMITED' | 'UNLIMITED' | null;
      maxSessions: number | null;
      loginBehavior: 'BLOCK' | 'REVOKE_OLDEST' | null;
    }>;
  } = { userPolicy: null, roleIds: [], rolePolicies: [] };

  const active = () => rows.filter((row) => row.revokedAt == null && row.expiresAt > new Date());

  const tx = (holder: { release: () => void }) => ({
    $executeRaw: async () => {
      locks.count += 1;
      await new Promise<void>((resolve) => {
        const previous = chain;
        chain = new Promise<void>((done) => {
          holder.release = done;
        });
        void previous.then(resolve);
      });
    },
    userSessionPolicy: { findUnique: async () => state.userPolicy },
    user: {
      findUnique: async () => ({ roles: state.roleIds.map((roleId) => ({ roleId })) }),
    },
    sessionSetting: { findUnique: async () => global },
    roleSessionPolicy: { findMany: async () => state.rolePolicies },
    refreshToken: {
      findMany: async () =>
        active()
          .slice()
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()),
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        rows.find(
          (row) => row.id === where.id && row.userId === where.userId && row.revokedAt == null,
        ) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.find((row) => row.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.find((item) => item.id === where.id);
        if (!row) throw new Error('missing session');
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id?: { in?: string[]; not?: string }; userId?: string; revokedAt?: null };
        data: Partial<Row>;
      }) => {
        let count = 0;
        for (const row of rows) {
          if (where.userId && row.userId !== where.userId) continue;
          if (where.revokedAt === null && row.revokedAt) continue;
          if (where.id?.in && !where.id.in.includes(row.id)) continue;
          if (where.id?.not && row.id === where.id.not) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
      create: async ({
        data,
      }: {
        data: Omit<Row, 'id' | 'revokedAt' | 'createdAt' | 'lastActivityAt'> & Partial<Row>;
      }) => {
        const row: Row = {
          id: `s-${++seq}`,
          revokedAt: null,
          createdAt: new Date(),
          lastActivityAt: new Date(),
          ...data,
          userId: data.userId,
          expiresAt: data.expiresAt,
        };
        rows.push(row);
        return { id: row.id };
      },
    },
    loginConfirmation: {
      updateMany: async ({ where }: { where?: { userId?: string; usedAt?: null } }) => {
        let count = 0;
        for (const ticket of tickets) {
          if (where?.userId && ticket.userId !== where.userId) continue;
          if (where?.usedAt === null && ticket.usedAt) continue;
          if (!ticket.usedAt) {
            ticket.usedAt = new Date();
            count += 1;
          }
        }
        return { count };
      },
      create: async ({
        data,
      }: {
        data: { userId: string; tokenHash: string; expiresAt: Date };
      }) => {
        const ticket = {
          id: `ticket-${++seq}`,
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          usedAt: null,
        };
        tickets.push(ticket);
        return ticket;
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        tickets.find((ticket) => ticket.tokenHash === where.tokenHash) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { usedAt?: Date } }) => {
        const ticket = tickets.find((item) => item.id === where.id);
        if (!ticket) throw new Error('missing ticket');
        Object.assign(ticket, data);
        return ticket;
      },
    },
  });

  const prisma = {
    $transaction: async (fn: (client: ReturnType<typeof tx>) => Promise<unknown>) => {
      const holder = { release: () => undefined as void };
      try {
        return await fn(tx(holder));
      } finally {
        holder.release();
      }
    },
    refreshToken: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.find((row) => row.id === where.id) ?? null,
      updateMany: async () => ({ count: 0 }),
    },
  };

  const audit = { log: jest.fn() };
  const service = new SessionEnforcementService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );

  return { service, rows, active, locks, state, audit };
}

const login = {
  userId: 'user-1',
  expiresAt: future(),
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0',
};

describe('session enforcement', () => {
  it('keeps a single active session when two logins arrive together and the limit is 1', async () => {
    const { service, active, locks } = harness({
      limitType: 'LIMITED',
      maxSessions: 1,
      loginBehavior: 'BLOCK',
    });

    const results = await Promise.allSettled([
      service.openLoginSession(login),
      service.openLoginSession(login),
    ]);

    expect(locks.count).toBe(2);
    expect(active()).toHaveLength(1);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const blocked = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(blocked.reason).toBeInstanceOf(BusinessRuleException);
    expect(blocked.reason.message).toContain('حداکثر مجاز');
  });

  it('revokes the oldest session instead of blocking when that behavior is set', async () => {
    const { service, rows, active } = harness({
      limitType: 'LIMITED',
      maxSessions: 1,
      loginBehavior: 'REVOKE_OLDEST',
    });
    await service.openLoginSession(login);
    const oldest = rows[0].id;
    await service.openLoginSession(login);

    expect(rows.find((row) => row.id === oldest)?.revokedAt).toBeInstanceOf(Date);
    expect(active()).toHaveLength(1);
    expect(active()[0].id).not.toBe(oldest);
  });

  it('allows two active sessions when the limit is 2 and blocks the third', async () => {
    const { service, active } = harness({
      limitType: 'LIMITED',
      maxSessions: 2,
      loginBehavior: 'BLOCK',
    });
    await service.openLoginSession(login);
    await service.openLoginSession(login);
    await expect(service.openLoginSession(login)).rejects.toBeInstanceOf(BusinessRuleException);
    expect(active()).toHaveLength(2);
  });

  it('allows several sessions when the effective policy is unlimited', async () => {
    const box = harness({
      limitType: 'UNLIMITED',
      maxSessions: null,
      loginBehavior: 'BLOCK',
    });
    await box.service.openLoginSession(login);
    await box.service.openLoginSession(login);
    await box.service.openLoginSession(login);
    expect(box.active()).toHaveLength(3);
  });

  it('uses the user override when it is more permissive than the role', async () => {
    const box = harness({
      limitType: 'LIMITED',
      maxSessions: 1,
      loginBehavior: 'BLOCK',
    });
    box.state.userPolicy = {
      mode: 'CUSTOM',
      limitType: 'UNLIMITED',
      maxSessions: null,
      loginBehavior: 'BLOCK',
    };
    box.state.roleIds = ['role-cashier'];
    box.state.rolePolicies = [
      {
        roleId: 'role-cashier',
        useDefault: false,
        limitType: 'LIMITED',
        maxSessions: 1,
        loginBehavior: 'BLOCK',
      },
    ];
    await box.service.openLoginSession(login);
    await box.service.openLoginSession(login);
    expect(box.active()).toHaveLength(2);
  });

  it('uses the role policy when the user inherits and the role does not use the default', async () => {
    const box = harness({
      limitType: 'LIMITED',
      maxSessions: 1,
      loginBehavior: 'BLOCK',
    });
    box.state.roleIds = ['role-owner'];
    box.state.rolePolicies = [
      {
        roleId: 'role-owner',
        useDefault: false,
        limitType: 'LIMITED',
        maxSessions: 2,
        loginBehavior: 'BLOCK',
      },
    ];
    await box.service.openLoginSession(login);
    await box.service.openLoginSession(login);
    await expect(box.service.openLoginSession(login)).rejects.toBeInstanceOf(BusinessRuleException);
    expect(box.active()).toHaveLength(2);
  });

  it('closes every other session from the blocked-login confirmation token', async () => {
    const box = harness({ limitType: 'LIMITED', maxSessions: 1, loginBehavior: 'BLOCK' });
    await box.service.openLoginSession(login);
    await expect(box.service.openLoginSession(login)).rejects.toBeInstanceOf(BusinessRuleException);
    let token = '';
    try {
      await box.service.openLoginSession(login);
    } catch (error) {
      const body = (error as BusinessRuleException).getResponse() as {
        details?: { confirmationToken?: string };
      };
      token = body.details?.confirmationToken ?? '';
    }
    expect(token).toEqual(expect.any(String));
    expect(token.length).toBeGreaterThan(10);
    const opened = await box.service.confirmLoginByClosingOthers({
      confirmationToken: token,
      expiresAt: future(),
      ipAddress: '127.0.0.1',
      userAgent: 'test',
    });
    expect(box.active()).toHaveLength(1);
    expect(box.active()[0].id).toBe(opened.sessionId);
  });

  it('rejects a revoked session on the next authenticated check', async () => {
    const box = harness({ limitType: 'LIMITED', maxSessions: 1, loginBehavior: 'BLOCK' });
    const opened = await box.service.openLoginSession(login);
    await box.service.revokeSession({
      actorId: 'admin-1',
      targetUserId: 'user-1',
      sessionId: opened.sessionId,
      currentSessionId: null,
      confirm: true,
      byAdmin: true,
    });
    await expect(box.service.assertActive(opened.sessionId, 'user-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(box.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SESSION_REVOKED_BY_ADMIN', actorId: 'admin-1' }),
    );
  });

  it('rejects an expired session on the next authenticated check', async () => {
    const box = harness({ limitType: 'LIMITED', maxSessions: 1, loginBehavior: 'BLOCK' });
    const opened = await box.service.openLoginSession(login);
    const row = box.rows.find((item) => item.id === opened.sessionId);
    if (!row) throw new Error('session missing');
    row.expiresAt = new Date(Date.now() - 1000);
    await expect(box.service.assertActive(opened.sessionId, 'user-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('session policy authorization', () => {
  it('refuses users who cannot administer session policies', async () => {
    const { assertCanManageSessions } = await import('./session-enforcement.service');
    expect(() => assertCanManageSessions(['customer.profile.read'], 'settings')).toThrow(
      ForbiddenException,
    );
    expect(() => assertCanManageSessions(['customer.profile.read'], 'user')).toThrow(
      ForbiddenException,
    );
    expect(() => assertCanManageSessions(['user.manage'], 'settings')).toThrow(ForbiddenException);
    expect(() => assertCanManageSessions(['session.policy.manage'], 'settings')).not.toThrow();
    expect(() => assertCanManageSessions(['user.manage'], 'user')).not.toThrow();
  });
});
