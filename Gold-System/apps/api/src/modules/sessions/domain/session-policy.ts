export const GLOBAL_SESSION_SETTING_ID = 'global';

export const ALLOWED_SESSION_LIMITS = [1, 2, 3, 5] as const;

export type SessionLimitValue = (typeof ALLOWED_SESSION_LIMITS)[number];

export const SESSION_LIMIT_REACHED_MESSAGE =
  'تعداد نشست‌های فعال شما به حداکثر مجاز رسیده است. ابتدا از یکی از دستگاه‌های فعال خارج شوید.';

export const SESSION_CONFIRMATION_MESSAGE =
  'برای ادامه ورود، یک نشست فعال را برای پایان دادن انتخاب کنید.';

export type SessionLimitType = 'LIMITED' | 'UNLIMITED';
export type SessionLoginBehavior = 'BLOCK' | 'REVOKE_OLDEST' | 'REQUIRE_CONFIRMATION';
export type UserSessionPolicyMode = 'INHERIT' | 'CUSTOM';
export type PolicySource = 'user' | 'role' | 'global';

export interface PolicyFields {
  limitType: SessionLimitType;
  maxSessions: number | null;
  loginBehavior: SessionLoginBehavior;
}

export interface EffectiveSessionPolicy extends PolicyFields {
  source: PolicySource;
}

export interface StoredUserPolicy {
  mode: UserSessionPolicyMode;
  limitType: SessionLimitType | null;
  maxSessions: number | null;
  loginBehavior: SessionLoginBehavior | null;
}

export interface StoredRolePolicy {
  useDefault: boolean;
  limitType: SessionLimitType | null;
  maxSessions: number | null;
  loginBehavior: SessionLoginBehavior | null;
}

const USER_BEHAVIORS: SessionLoginBehavior[] = ['BLOCK', 'REVOKE_OLDEST'];

export function isAllowedSessionLimit(value: number): value is SessionLimitValue {
  return (ALLOWED_SESSION_LIMITS as readonly number[]).includes(value);
}

export function normalizeLimitedPolicy(
  limitType: SessionLimitType,
  maxSessions: number | null | undefined,
  loginBehavior: SessionLoginBehavior,
): PolicyFields {
  if (limitType === 'UNLIMITED') {
    return { limitType, maxSessions: null, loginBehavior };
  }
  if (maxSessions == null || !isAllowedSessionLimit(maxSessions)) {
    throw new Error('SESSION_LIMIT_INVALID');
  }
  return { limitType: 'LIMITED', maxSessions, loginBehavior };
}

function behaviorRank(behavior: SessionLoginBehavior): number {
  if (behavior === 'BLOCK') return 0;
  if (behavior === 'REQUIRE_CONFIRMATION') return 1;
  return 2;
}

function limitRank(policy: PolicyFields): number {
  if (policy.limitType === 'UNLIMITED') return Number.POSITIVE_INFINITY;
  return policy.maxSessions ?? Number.POSITIVE_INFINITY;
}

function pickStrictest(policies: PolicyFields[]): PolicyFields {
  return policies.reduce((best, current) => {
    const bestLimit = limitRank(best);
    const currentLimit = limitRank(current);
    if (currentLimit < bestLimit) return current;
    if (currentLimit > bestLimit) return best;
    return behaviorRank(current.loginBehavior) < behaviorRank(best.loginBehavior) ? current : best;
  });
}

function fromStored(
  limitType: SessionLimitType | null,
  maxSessions: number | null,
  loginBehavior: SessionLoginBehavior | null,
  allowedBehaviors: SessionLoginBehavior[],
): PolicyFields | null {
  if (!limitType || !loginBehavior || !allowedBehaviors.includes(loginBehavior)) return null;
  if (limitType === 'UNLIMITED') {
    return { limitType, maxSessions: null, loginBehavior };
  }
  if (maxSessions == null || !isAllowedSessionLimit(maxSessions)) return null;
  return { limitType: 'LIMITED', maxSessions, loginBehavior };
}

/**
 * Precedence: user custom override, then the strictest custom role policy,
 * then the global default. A user with several custom roles receives the
 * smallest session ceiling. Unlimited applies only when every considered
 * custom role is unlimited.
 */
export function resolveEffectivePolicy(input: {
  user: StoredUserPolicy | null;
  roles: StoredRolePolicy[];
  global: PolicyFields;
}): EffectiveSessionPolicy {
  if (input.user?.mode === 'CUSTOM') {
    const custom = fromStored(
      input.user.limitType,
      input.user.maxSessions,
      input.user.loginBehavior,
      USER_BEHAVIORS,
    );
    if (custom) return { ...custom, source: 'user' };
  }

  const rolePolicies = input.roles
    .filter((role) => !role.useDefault)
    .map((role) => fromStored(role.limitType, role.maxSessions, role.loginBehavior, USER_BEHAVIORS))
    .filter((policy): policy is PolicyFields => policy != null);

  if (rolePolicies.length > 0) {
    return { ...pickStrictest(rolePolicies), source: 'role' };
  }

  return { ...input.global, source: 'global' };
}

export interface ActiveSessionRef {
  id: string;
  createdAt: Date;
}

export type AdmissionDecision =
  | { type: 'allow' }
  | { type: 'block' }
  | { type: 'revoke'; sessionIds: string[] }
  | { type: 'confirm' };

export function decideAdmission(
  active: ActiveSessionRef[],
  policy: PolicyFields,
): AdmissionDecision {
  if (policy.limitType === 'UNLIMITED') return { type: 'allow' };
  const max = policy.maxSessions ?? 1;
  if (active.length < max) return { type: 'allow' };
  if (policy.loginBehavior === 'REVOKE_OLDEST') {
    const excess = active.length - max + 1;
    const oldest = [...active]
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .slice(0, excess);
    return { type: 'revoke', sessionIds: oldest.map((session) => session.id) };
  }
  if (policy.loginBehavior === 'REQUIRE_CONFIRMATION') return { type: 'confirm' };
  return { type: 'block' };
}
