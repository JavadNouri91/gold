import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
import { SessionEnforcementService } from '../sessions/application/session-enforcement.service';

describe('JwtStrategy', () => {
  const sessions = { assertActive: jest.fn() };

  function strategy() {
    const config = { get: () => 'x'.repeat(32) } as unknown as ConfigService;
    return new JwtStrategy(config, sessions as unknown as SessionEnforcementService);
  }

  beforeEach(() => {
    sessions.assertActive.mockReset();
  });

  it('exposes both userId and sub from the token subject', async () => {
    await expect(
      strategy().validate({
        sub: 'user-1',
        mobile: '09120000000',
        roles: ['customer'],
        permissions: ['customer.profile.read'],
      }),
    ).resolves.toEqual({
      userId: 'user-1',
      sub: 'user-1',
      mobile: '09120000000',
      roles: ['customer'],
      permissions: ['customer.profile.read'],
      sessionId: null,
    });
    expect(sessions.assertActive).not.toHaveBeenCalled();
  });

  it('rejects a revoked session before the access token is accepted', async () => {
    sessions.assertActive.mockRejectedValue(new UnauthorizedException('revoked'));
    await expect(
      strategy().validate({
        sub: 'user-1',
        sid: 'session-1',
        mobile: '09120000000',
        roles: [],
        permissions: [],
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired session before the access token is accepted', async () => {
    sessions.assertActive.mockRejectedValue(new UnauthorizedException('expired'));
    await expect(
      strategy().validate({
        sub: 'user-1',
        sid: 'session-1',
        mobile: '09120000000',
        roles: [],
        permissions: [],
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.assertActive).toHaveBeenCalledWith('session-1', 'user-1');
  });
});
