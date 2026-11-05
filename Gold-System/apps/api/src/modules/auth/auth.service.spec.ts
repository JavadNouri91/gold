import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './application/auth.service';
import { hashRefreshToken } from './domain/refresh-token.hash';

describe('Authentication security', () => {
  const mobile = '09120000000';
  const password = 'Secure password 123';
  const user = { id: 'u1', mobile, roles: ['customer'], permissions: [], isActive: () => true };
  const users = {
    findByMobileWithPassword: jest.fn(),
    findByMobile: jest.fn(),
    findById: jest.fn(),
    updateLastLogin: jest.fn(),
  };
  const tx = {
    user: { update: jest.fn(), create: jest.fn() },
    customer: { findUnique: jest.fn() },
    role: { findUniqueOrThrow: jest.fn() },
    customerAccount: { create: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    loginConfirmation: { updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
    otpCode: { create: jest.fn(), updateMany: jest.fn() },
    userRole: { findMany: jest.fn() },
  };
  const otp = { createOrReplace: jest.fn(), invalidate: jest.fn(), consume: jest.fn() };
  const refresh = { findByTokenHash: jest.fn(), revoke: jest.fn() };
  const notifications = { sendOtp: jest.fn() };
  const sessions = { openLoginSession: jest.fn(), rotateRefreshToken: jest.fn() };
  const security = { assertAccount: jest.fn() };
  const customers = { createCustomerProfile: jest.fn() };
  let service: AuthService;
  let nodeEnv: string;
  beforeEach(async () => {
    jest.resetAllMocks();
    nodeEnv = 'production';
    users.findByMobileWithPassword.mockResolvedValue({
      user,
      passwordHash: await argon2.hash(password),
    });
    users.findByMobile.mockResolvedValue(user);
    users.findById.mockResolvedValue(user);
    tx.customer.findUnique.mockResolvedValue(null);
    tx.userRole.findMany.mockResolvedValue([{ role: { name: 'customer' } }]);
    tx.user.create.mockResolvedValue(user);
    tx.role.findUniqueOrThrow.mockResolvedValue({ id: 'customer-role' });
    customers.createCustomerProfile.mockResolvedValue({ id: 'c1' });
    otp.consume.mockImplementation(async (_m, _p, _c, effect) => effect(tx, { userId: user.id }));
    sessions.openLoginSession.mockResolvedValue({ sessionId: 'sid', refreshToken: 'refresh' });
    sessions.rotateRefreshToken.mockResolvedValue('rotated');
    const config = {
      get: (key: string) => key === 'app.nodeEnv' ? nodeEnv : ({ accessExpiresIn: '15m', refreshExpiresIn: '7d', loginBypass: true }),
    };
    service = new AuthService(
      users as never,
      { sign: () => 'access' } as never,
      config as never,
      otp as never,
      refresh as never,
      { log: jest.fn() } as never,
      notifications as never,
      sessions as never,
      tx as never,
      customers as never,
      security as never,
    );
  });

  it('accepts a customer password and issues the existing session', async () => {
    await expect(service.customerPasswordLogin(mobile, password)).resolves.toMatchObject({
      accessToken: 'access',
    });
    expect(sessions.openLoginSession).toHaveBeenCalled();
    expect(otp.createOrReplace).not.toHaveBeenCalled();
  });
  it('rejects incorrect passwords and unknown mobiles', async () => {
    await expect(service.customerPasswordLogin(mobile, 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    users.findByMobileWithPassword.mockResolvedValue(null);
    await expect(service.customerPasswordLogin(mobile, password)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessions.openLoginSession).not.toHaveBeenCalled();
  });
  it('rejects staff and mixed roles through both customer methods', async () => {
    users.findByMobileWithPassword.mockResolvedValue({
      user: { ...user, roles: ['customer', 'admin'] },
      passwordHash: await argon2.hash(password),
    });
    await expect(service.customerPasswordLogin(mobile, password)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await service.requestCustomerOtp(mobile);
    expect(otp.createOrReplace).not.toHaveBeenCalled();
  });
  it('requires staff OTP in production even when the development bypass is enabled', async () => {
    await expect(service.initiateLogin(mobile, password)).resolves.toMatchObject({
      requiresOtp: true,
    });
    expect(sessions.openLoginSession).not.toHaveBeenCalled();
    expect(otp.createOrReplace).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'LOGIN' }));
  });
  it('allows password-only login in development using the normal session enforcement', async () => {
    nodeEnv = 'development';
    await expect(service.initiateLogin(mobile, password)).resolves.toMatchObject({
      requiresOtp: false,
      accessToken: 'access',
    });
    expect(sessions.openLoginSession).toHaveBeenCalled();
    expect(otp.createOrReplace).not.toHaveBeenCalled();
  });
  it('still rejects an incorrect password with the development bypass', async () => {
    nodeEnv = 'development';
    await expect(service.initiateLogin(mobile, 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.openLoginSession).not.toHaveBeenCalled();
  });
  it('invalidates an undelivered challenge', async () => {
    notifications.sendOtp.mockRejectedValue(new Error('provider failed'));
    await service.requestCustomerOtp(mobile);
    expect(otp.invalidate).toHaveBeenCalledWith(mobile, 'CUSTOMER_LOGIN');
  });
  it('never registers unknown mobiles through SMS login', async () => {
    users.findByMobileWithPassword.mockResolvedValue(null);
    await service.requestCustomerOtp(mobile);
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(otp.createOrReplace).not.toHaveBeenCalled();
  });
  it('accepts an existing legacy password without forcing recovery', async () => {
    tx.customer.findUnique.mockResolvedValue({ nationalId: password });
    await expect(service.customerPasswordLogin(mobile, password)).resolves.toMatchObject({
      accessToken: 'access',
    });
    expect(sessions.openLoginSession).toHaveBeenCalled();
  });
  it.each(['0012345678', '۰۰۱۲۳۴۵۶۷۸', '٠٠١٢٣٤٥٦٧٨'])(
    'accepts existing legacy digit representation %s without changing its password',
    async (entered) => {
      tx.customer.findUnique.mockResolvedValue({ nationalId: '0012345678' });
      users.findByMobileWithPassword.mockResolvedValue({
        user,
        passwordHash: await argon2.hash('0012345678'),
      });
      await expect(service.customerPasswordLogin(mobile, entered)).resolves.toMatchObject({
        accessToken: 'access',
      });
      expect(sessions.openLoginSession).toHaveBeenCalled();
      expect(notifications.sendOtp).not.toHaveBeenCalled();
    },
  );
  it('does not normalize digits in a customer-chosen password', async () => {
    users.findByMobileWithPassword.mockResolvedValue({
      user,
      passwordHash: await argon2.hash('Exact password ۱۲۳'),
    });
    await expect(
      service.customerPasswordLogin(mobile, 'Exact password 123'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.customerPasswordLogin(mobile, 'Exact password ۱۲۳'),
    ).resolves.toMatchObject({ accessToken: 'access' });
  });
  it('does not accept national ID when the existing password has already been changed', async () => {
    tx.customer.findUnique.mockResolvedValue({ nationalId: '0012345678' });
    await expect(service.customerPasswordLogin(mobile, '۰۰۱۲۳۴۵۶۷۸')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessions.openLoginSession).not.toHaveBeenCalled();
  });
  it('blocks disabled accounts before session creation', async () => {
    security.assertAccount.mockRejectedValue(new UnauthorizedException());
    await expect(service.customerPasswordLogin(mobile, password)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessions.openLoginSession).not.toHaveBeenCalled();
  });
  it('stores only a password hash in pending registration and creates no account', async () => {
    users.findByMobile.mockResolvedValue(null);
    await service.initiateRegistration({
      firstName: 'First',
      lastName: 'Last',
      mobile,
      password,
      confirmPassword: password,
    });
    const challenge = otp.createOrReplace.mock.calls[0][0];
    expect(challenge.purpose).toBe('REGISTRATION');
    expect(challenge.payload.password).toBeUndefined();
    expect(await argon2.verify(challenge.payload.passwordHash, password)).toBe(true);
    expect(tx.user.create).not.toHaveBeenCalled();
  });
  it('rejects weak and mismatching registration passwords', async () => {
    for (const [p, confirmation] of [
      ['weak', 'weak'],
      [password, 'different'],
    ]) {
      await expect(
        service.initiateRegistration({
          firstName: 'F',
          lastName: 'L',
          mobile,
          password: p,
          confirmPassword: confirmation,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(otp.createOrReplace).not.toHaveBeenCalled();
  });
  it('does not replace an existing account during registration', async () => {
    await service.initiateRegistration({
      firstName: 'F',
      lastName: 'L',
      mobile,
      password,
      confirmPassword: password,
    });
    expect(otp.createOrReplace).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });
  it('binds customer verification to its purpose and rechecks roles', async () => {
    await service.verifyCustomerOtp(mobile, '123456');
    expect(otp.consume).toHaveBeenCalledWith(
      mobile,
      'CUSTOMER_LOGIN',
      '123456',
      expect.any(Function),
    );
    tx.userRole.findMany.mockResolvedValue([{ role: { name: 'admin' } }]);
    await expect(service.verifyCustomerOtp(mobile, '123456')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it('creates an expiring reset grant only after password-reset OTP verification', async () => {
    const result = await service.verifyPasswordReset(mobile, '123456');
    expect(result.resetGrant).toMatch(/^[a-f0-9]{64}$/);
    expect(otp.consume).toHaveBeenCalledWith(
      mobile,
      'PASSWORD_RESET',
      '123456',
      expect.any(Function),
    );
    expect(tx.otpCode.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ purpose: 'RESET_GRANT' }) }),
    );
  });
  it('resets the password and revokes all sessions in the consumption transaction', async () => {
    await service.resetPassword(mobile, 'grant', password, password);
    expect(otp.consume).toHaveBeenCalledWith(mobile, 'RESET_GRANT', 'grant', expect.any(Function));
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
    );
    const hash = tx.user.update.mock.calls[0][0].data.passwordHash;
    expect(await argon2.verify(hash, password)).toBe(true);
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
  it('propagates invalid, expired, or replayed challenges without issuing sessions', async () => {
    otp.consume.mockRejectedValue(new UnauthorizedException());
    await expect(service.verifyCustomerOtp(mobile, '123456')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessions.openLoginSession).not.toHaveBeenCalled();
  });
  it('rotates refresh secrets and refuses inactive accounts', async () => {
    refresh.findByTokenHash.mockResolvedValue({
      id: 'sid',
      userId: 'u1',
      expiresAt: new Date(Date.now() + 60000),
    });
    await expect(service.refresh('secret')).resolves.toMatchObject({
      refreshToken: 'rotated',
      user: { id: user.id, mobile },
    });
    expect(refresh.findByTokenHash).toHaveBeenCalledWith(hashRefreshToken('secret'));
    security.assertAccount.mockRejectedValue(new UnauthorizedException());
    await expect(service.refresh('secret')).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('revokes only the hashed refresh token on logout', async () => {
    refresh.findByTokenHash.mockResolvedValue({ id: 'sid' });
    await service.logout('secret');
    expect(refresh.findByTokenHash).toHaveBeenCalledWith(hashRefreshToken('secret'));
    expect(refresh.revoke).toHaveBeenCalledWith('sid');
  });
});
