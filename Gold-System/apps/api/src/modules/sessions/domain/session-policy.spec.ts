import {
  decideAdmission,
  resolveEffectivePolicy,
  type PolicyFields,
  type StoredRolePolicy,
} from './session-policy';

const globalDefault: PolicyFields = {
  limitType: 'LIMITED',
  maxSessions: 1,
  loginBehavior: 'BLOCK',
};

function at(id: string, minute: number) {
  return { id, createdAt: new Date(Date.UTC(2026, 0, 1, 0, minute)) };
}

describe('session policy precedence', () => {
  it('applies the global default when the role and user do not override it', () => {
    const effective = resolveEffectivePolicy({
      user: { mode: 'INHERIT', limitType: null, maxSessions: null, loginBehavior: null },
      roles: [{ useDefault: true, limitType: null, maxSessions: null, loginBehavior: null }],
      global: globalDefault,
    });

    expect(effective).toEqual({ ...globalDefault, source: 'global' });
  });

  it('lets a role setting override the global default', () => {
    const effective = resolveEffectivePolicy({
      user: null,
      roles: [
        {
          useDefault: false,
          limitType: 'LIMITED',
          maxSessions: 3,
          loginBehavior: 'REVOKE_OLDEST',
        },
      ],
      global: globalDefault,
    });

    expect(effective).toMatchObject({
      source: 'role',
      maxSessions: 3,
      loginBehavior: 'REVOKE_OLDEST',
    });
  });

  it('lets a user override take precedence over the role', () => {
    const effective = resolveEffectivePolicy({
      user: {
        mode: 'CUSTOM',
        limitType: 'UNLIMITED',
        maxSessions: null,
        loginBehavior: 'BLOCK',
      },
      roles: [
        {
          useDefault: false,
          limitType: 'LIMITED',
          maxSessions: 1,
          loginBehavior: 'BLOCK',
        },
      ],
      global: globalDefault,
    });

    expect(effective).toMatchObject({ source: 'user', limitType: 'UNLIMITED', maxSessions: null });
  });

  it('uses the strictest custom role when a user has several roles', () => {
    const roles: StoredRolePolicy[] = [
      { useDefault: false, limitType: 'LIMITED', maxSessions: 5, loginBehavior: 'REVOKE_OLDEST' },
      { useDefault: false, limitType: 'LIMITED', maxSessions: 2, loginBehavior: 'BLOCK' },
      { useDefault: true, limitType: null, maxSessions: null, loginBehavior: null },
    ];

    expect(resolveEffectivePolicy({ user: null, roles, global: globalDefault })).toMatchObject({
      source: 'role',
      maxSessions: 2,
      loginBehavior: 'BLOCK',
    });
  });
});

describe('session admission', () => {
  const block: PolicyFields = { limitType: 'LIMITED', maxSessions: 1, loginBehavior: 'BLOCK' };

  it('allows the only session when the limit is 1 and none are active', () => {
    expect(decideAdmission([], block)).toEqual({ type: 'allow' });
  });

  it('blocks a second login when the policy is BLOCK', () => {
    expect(decideAdmission([at('s1', 1)], block)).toEqual({ type: 'block' });
  });

  it('revokes the oldest session when the policy is REVOKE_OLDEST', () => {
    const decision = decideAdmission([at('older', 1)], {
      limitType: 'LIMITED',
      maxSessions: 1,
      loginBehavior: 'REVOKE_OLDEST',
    });
    expect(decision).toEqual({ type: 'revoke', sessionIds: ['older'] });
  });

  it('revokes enough oldest sessions to make room when the account is already over the limit', () => {
    const decision = decideAdmission([at('newer', 5), at('older', 1)], {
      limitType: 'LIMITED',
      maxSessions: 1,
      loginBehavior: 'REVOKE_OLDEST',
    });
    expect(decision).toEqual({ type: 'revoke', sessionIds: ['older', 'newer'] });
  });

  it('allows a second session when the limit is 2', () => {
    expect(
      decideAdmission([at('s1', 1)], {
        limitType: 'LIMITED',
        maxSessions: 2,
        loginBehavior: 'BLOCK',
      }),
    ).toEqual({ type: 'allow' });
  });

  it('blocks the third session when the limit is 2', () => {
    expect(
      decideAdmission([at('s1', 1), at('s2', 2)], {
        limitType: 'LIMITED',
        maxSessions: 2,
        loginBehavior: 'BLOCK',
      }),
    ).toEqual({ type: 'block' });
  });

  it('allows multiple sessions for an unlimited policy', () => {
    expect(
      decideAdmission([at('s1', 1), at('s2', 2), at('s3', 3)], {
        limitType: 'UNLIMITED',
        maxSessions: null,
        loginBehavior: 'BLOCK',
      }),
    ).toEqual({ type: 'allow' });
  });

  it('asks for confirmation when that behavior is configured and the limit is full', () => {
    expect(
      decideAdmission([at('s1', 1)], {
        limitType: 'LIMITED',
        maxSessions: 1,
        loginBehavior: 'REQUIRE_CONFIRMATION',
      }),
    ).toEqual({ type: 'confirm' });
  });
});
