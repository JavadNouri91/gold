export const IDLE_TIMEOUT_MIN_MINUTES = 5;
export const IDLE_TIMEOUT_MAX_MINUTES = 480;
export const MAX_SESSION_DURATION_MIN_MINUTES = 15;
export const MAX_SESSION_DURATION_MAX_MINUTES = 43_200; // 30 days

export type SessionTimeLimitReason = 'idle' | 'max_duration';

export interface GlobalSessionTimeLimits {
  idleTimeoutMinutes: number | null;
  maxSessionDurationMinutes: number | null;
}

export function isValidIdleTimeoutMinutes(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= IDLE_TIMEOUT_MIN_MINUTES &&
    value <= IDLE_TIMEOUT_MAX_MINUTES
  );
}

export function isValidMaxSessionDurationMinutes(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MAX_SESSION_DURATION_MIN_MINUTES &&
    value <= MAX_SESSION_DURATION_MAX_MINUTES
  );
}

export function evaluateSessionTimeLimits(
  session: { createdAt: Date; lastActivityAt: Date },
  limits: GlobalSessionTimeLimits,
  now = new Date(),
): SessionTimeLimitReason | null {
  if (limits.maxSessionDurationMinutes != null) {
    const end = session.createdAt.getTime() + limits.maxSessionDurationMinutes * 60_000;
    if (now.getTime() >= end) return 'max_duration';
  }
  if (limits.idleTimeoutMinutes != null) {
    const idleEnd = session.lastActivityAt.getTime() + limits.idleTimeoutMinutes * 60_000;
    if (now.getTime() >= idleEnd) return 'idle';
  }
  return null;
}

/** Never extend refresh expiry beyond the absolute cap from login. */
export function clampRefreshExpiresAt(
  createdAt: Date,
  proposedExpiresAt: Date,
  maxSessionDurationMinutes: number | null,
): Date {
  if (maxSessionDurationMinutes == null) return proposedExpiresAt;
  const absoluteEnd = new Date(createdAt.getTime() + maxSessionDurationMinutes * 60_000);
  return proposedExpiresAt < absoluteEnd ? proposedExpiresAt : absoluteEnd;
}
