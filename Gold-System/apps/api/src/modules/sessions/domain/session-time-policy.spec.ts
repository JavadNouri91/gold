import {
  clampRefreshExpiresAt,
  evaluateSessionTimeLimits,
  isValidIdleTimeoutMinutes,
  isValidMaxSessionDurationMinutes,
} from './session-time-policy';

describe('session-time-policy', () => {
  it('validates configured minute ranges', () => {
    expect(isValidIdleTimeoutMinutes(5)).toBe(true);
    expect(isValidIdleTimeoutMinutes(4)).toBe(false);
    expect(isValidMaxSessionDurationMinutes(15)).toBe(true);
    expect(isValidMaxSessionDurationMinutes(14)).toBe(false);
  });

  it('detects idle and absolute limits', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const session = {
      createdAt: new Date('2026-01-01T10:00:00Z'),
      lastActivityAt: new Date('2026-01-01T11:00:00Z'),
    };
    expect(
      evaluateSessionTimeLimits(session, { idleTimeoutMinutes: 30, maxSessionDurationMinutes: null }, now),
    ).toBe('idle');
    expect(
      evaluateSessionTimeLimits(
        session,
        { idleTimeoutMinutes: null, maxSessionDurationMinutes: 90 },
        now,
      ),
    ).toBe('max_duration');
    expect(
      evaluateSessionTimeLimits(session, { idleTimeoutMinutes: null, maxSessionDurationMinutes: null }, now),
    ).toBeNull();
  });

  it('clamps refresh expiry to the absolute cap', () => {
    const createdAt = new Date('2026-01-01T10:00:00Z');
    const proposed = new Date('2026-01-08T10:00:00Z');
    const clamped = clampRefreshExpiresAt(createdAt, proposed, 60);
    expect(clamped.toISOString()).toBe('2026-01-01T11:00:00.000Z');
  });
});
