import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './application/auth.service';
import { hashRefreshToken } from './domain/refresh-token.hash';
import { UsersService } from '../users/application/users.service';
import { AuditService } from '../audit/application/audit.service';
import { OtpRepository } from './infrastructure/repositories/otp.repository';
import { RefreshTokenRepository } from './infrastructure/repositories/refresh-token.repository';
import { NotificationService } from '../notifications/application/notification.service';
import { SessionEnforcementService } from '../sessions/application/session-enforcement.service';

describe('AuthService security', () => {
  const users = {
    findByMobileWithPassword: jest.fn(),
    findByMobile: jest.fn(),
    findById: jest.fn(),
    updateLastLogin: jest.fn(),
  };
  const jwt = { sign: jest.fn().mockReturnValue('access-token') };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'otp') return { length: 6, expiresInSeconds: 120, maxAttempts: 5 };
      if (key === 'jwt') {
        return {
          accessSecret: 'a'.repeat(32),
          accessExpiresIn: '15m',
          refreshExpiresIn: '7d',
        };
      }
      return undefined;
    }),
  };
  const otpRepo = {
    createOrReplace: jest.fn(),
    findActive: jest.fn(),
    incrementAttempts: jest.fn(),
    verifyCode: jest.fn(),
    markUsed: jest.fn(),
  };
  const refreshRepo = {
    create: jest.fn(),
    findByTokenHash: jest.fn(),
    revoke: jest.fn(),
    listActiveForUser: jest.fn(),
  };
  const sessions = {
    openLoginSession: jest.fn(),
    rotateRefreshToken: jest.fn(),
    listForUser: jest.fn(),
    confirmLoginSession: jest.fn(),
    revokeSession: jest.fn(),
    revokeOtherSessions: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const notifications = { sendOtp: jest.fn() };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      users as unknown as UsersService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
      otpRepo as unknown as OtpRepository,
      refreshRepo as unknown as RefreshTokenRepository,
      audit as unknown as AuditService,
      notifications as unknown as NotificationService,
      sessions as unknown as SessionEnforcementService,
    );
  });

  it('returns 401 for an unknown mobile without throwing from the timing pad', async () => {
    users.findByMobileWithPassword.mockResolvedValue(null);

    await expect(
      service.initiateLogin('09120000000', 'not-a-real-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('still completes login initiation when SMS delivery fails', async () => {
    users.findByMobileWithPassword.mockResolvedValue({
      user: { id: 'u1', isActive: () => true },
      passwordHash: await import('argon2').then((a) => a.hash('password1')),
    });
    notifications.sendOtp.mockRejectedValue(new Error('provider timeout'));

    await expect(service.initiateLogin('09120000000', 'password1')).resolves.toEqual({
      message: 'OTP sent to your registered mobile number',
    });
    expect(otpRepo.createOrReplace).toHaveBeenCalled();
  });

  it('issues a session-bound access token and rotates the refresh secret in place', async () => {
    sessions.openLoginSession.mockResolvedValue({
      sessionId: 'rt-1',
      refreshToken: 'issued-refresh',
    });
    refreshRepo.findByTokenHash.mockImplementation(async (hash: string) => {
      if (hash !== hashRefreshToken('issued-refresh')) return null;
      return {
        id: 'rt-1',
        userId: 'u1',
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      };
    });
    sessions.rotateRefreshToken.mockResolvedValue('rotated-refresh');
    users.findById.mockResolvedValue({
      id: 'u1',
      mobile: '09120000000',
      roles: ['customer'],
      permissions: ['customer.profile.read'],
    });

    otpRepo.findActive.mockResolvedValue({ id: 'otp-1', attempts: 0 });
    otpRepo.verifyCode.mockResolvedValue(true);
    users.findByMobile.mockResolvedValue({
      id: 'u1',
      mobile: '09120000000',
      roles: ['customer'],
      permissions: ['customer.profile.read'],
    });

    const issued = await service.verifyOtp('09120000000', '123456');
    expect(issued.refreshToken).toBe('issued-refresh');
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sid: 'rt-1', sub: 'u1' }),
      expect.any(Object),
    );

    const rotated = await service.refresh(issued.refreshToken);
    expect(refreshRepo.revoke).not.toHaveBeenCalled();
    expect(sessions.rotateRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'rt-1', userId: 'u1' }),
    );
    expect(rotated.refreshToken).toBe('rotated-refresh');
    expect(rotated.refreshToken).not.toBe(issued.refreshToken);
  });

  it('revokes a refresh token on logout using the stored hash', async () => {
    const raw = 'refresh-token-value';
    refreshRepo.findByTokenHash.mockResolvedValue({ id: 'rt-9' });

    await service.logout(raw);

    expect(refreshRepo.findByTokenHash).toHaveBeenCalledWith(hashRefreshToken(raw));
    expect(refreshRepo.revoke).toHaveBeenCalledWith('rt-9');
  });
});
