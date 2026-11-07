import { PrismaClient } from '@prisma/client';
import { OtpRepository } from './infrastructure/repositories/otp.repository';
import { PrismaService } from '../../database/prisma.service';
import { AuthSecurityService } from './application/auth-security.service';
import { AuthService } from './application/auth.service';
import { UsersService } from '../users/application/users.service';
import { UserRepository } from '../users/infrastructure/repositories/user.repository';
import { CustomerRepository } from '../customers/infrastructure/repositories/customer.repository';
import { CustomersService } from '../customers/application/customers.service';
import { CustomerAccountRepository } from '../customer-accounts/infrastructure/repositories/customer-account.repository';

const configuredUrl = process.env.AUTH_TEST_DATABASE_URL;
const integrationUrl =
  configuredUrl && /\/gold_auth_test[_?]/.test(configuredUrl) ? configuredUrl : undefined;
const url = integrationUrl ?? 'postgresql://localhost:5432/gold_auth_test';
const integration = integrationUrl ? describe : describe.skip;

integration('Customer authentication against isolated PostgreSQL', () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const prisma = db as unknown as PrismaService;
  const otp = new OtpRepository(prisma);
  const security = new AuthSecurityService(prisma);
  const audit = { log: jest.fn() };
  const users = new UsersService(new UserRepository(prisma), audit as never);
  const accounts = new CustomerAccountRepository(prisma);
  const customers = new CustomersService(
    prisma,
    new CustomerRepository(prisma),
    accounts,
    users,
    audit as never,
    {} as never,
  );
  const notifications = { sendOtp: jest.fn() };
  const sessions = {
    openLoginSession: jest
      .fn()
      .mockResolvedValue({ sessionId: 'test-session', refreshToken: 'test-refresh' }),
  };
  const service = new AuthService(
    users,
    { sign: () => 'test-access' } as never,
    { get: () => ({ accessExpiresIn: '15m', refreshExpiresIn: '7d' }) } as never,
    otp,
    {} as never,
    audit as never,
    notifications as never,
    sessions as never,
    prisma,
    customers,
    security,
  );
  let sequence = Number(String(Date.now()).slice(-7));
  const nextMobile = () => `0912${String(sequence++).padStart(7, '0')}`;
  const password = 'Correct horse battery 123';
  beforeAll(async () => {
    await db.$connect();
    await db.role.upsert({
      where: { name: 'customer' },
      create: { name: 'customer', description: 'Test customer' },
      update: {},
    });
  });
  beforeEach(() => notifications.sendOtp.mockReset());
  afterAll(() => db.$disconnect());

  it('creates one verified customer and one zero account under concurrent verification', async () => {
    const mobile = nextMobile();
    const ledgerBefore = await db.financialLedgerEntry.count();
    await service.initiateRegistration({
      firstName: 'Test',
      lastName: 'Customer',
      mobile,
      password,
      confirmPassword: password,
    });
    expect(await db.user.count({ where: { mobile } })).toBe(0);
    const code = notifications.sendOtp.mock.calls[0][2] as string;
    const results = await Promise.allSettled([
      service.verifyRegistration(mobile, code),
      service.verifyRegistration(mobile, code),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const customer = await db.customer.findUniqueOrThrow({
      where: { mobile },
      include: { account: true, user: { include: { roles: { include: { role: true } } } } },
    });
    expect(customer.status).toBe('PENDING');
    expect(customer.accountStatus).toBe('INACTIVE');
    expect(customer.nationalId).toBeNull();
    expect(customer.user?.mobileVerifiedAt).toBeInstanceOf(Date);
    expect(customer.user?.roles.map((r) => r.role.name)).toEqual(['customer']);
    expect(await db.customerAccount.count({ where: { customerId: customer.id } })).toBe(1);
    expect(customer.account?.creditLimitRial.toString()).toBe('0');
    expect(customer.account?.creditLimitGoldRial.toString()).toBe('0');
    const again = await accounts.createForCustomer(customer.id);
    expect(again.id).toBe(customer.account?.id);
    expect(await db.financialLedgerEntry.count()).toBe(ledgerBefore);
    await expect(service.verifyRegistration(mobile, code)).rejects.toThrow();
  });
  it('serializes creation for different mobiles without duplicate customer numbers', async () => {
    const mobiles = [nextMobile(), nextMobile()];
    await Promise.all(
      mobiles.map((mobile) =>
        service.initiateRegistration({
          firstName: 'Test',
          lastName: 'Customer',
          mobile,
          password,
          confirmPassword: password,
        }),
      ),
    );
    const codes = new Map(
      notifications.sendOtp.mock.calls.map((call) => [call[1], call[2] as string]),
    );
    await Promise.all(
      mobiles.map((mobile) => service.verifyRegistration(mobile, codes.get(mobile)!)),
    );
    expect(await db.customer.count({ where: { mobile: { in: mobiles } } })).toBe(2);
  });
  it('commits failed attempt limits and rejects other purposes, expired codes, and replay', async () => {
    const mobile = nextMobile();
    await otp.createOrReplace({
      mobile,
      userId: null,
      purpose: 'REGISTRATION',
      code: '123456',
      expiresAt: new Date(Date.now() + 120000),
    });
    const effect = jest.fn();
    await expect(otp.consume(mobile, 'CUSTOMER_LOGIN', '123456', effect)).rejects.toThrow();
    for (let i = 0; i < 3; i++)
      await expect(otp.consume(mobile, 'REGISTRATION', '000000', effect)).rejects.toThrow();
    await expect(otp.consume(mobile, 'REGISTRATION', '123456', effect)).rejects.toThrow();
    expect((await db.otpCode.findFirstOrThrow({ where: { mobile } })).attempts).toBe(3);
    expect(effect).not.toHaveBeenCalled();
    await otp.createOrReplace({
      mobile,
      userId: null,
      purpose: 'REGISTRATION',
      code: '123456',
      expiresAt: new Date(Date.now() - 1),
    });
    await expect(otp.consume(mobile, 'REGISTRATION', '123456', effect)).rejects.toThrow();
  });
  it('rolls back challenge consumption and user creation when the atomic effect fails', async () => {
    const mobile = nextMobile();
    await otp.createOrReplace({
      mobile,
      userId: null,
      purpose: 'REGISTRATION',
      code: '123456',
      expiresAt: new Date(Date.now() + 120000),
    });
    await expect(
      otp.consume(mobile, 'REGISTRATION', '123456', async (tx) => {
        await tx.user.create({ data: { mobile, name: 'Rollback' } });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await db.user.count({ where: { mobile } })).toBe(0);
    expect(await otp.findActive(mobile, 'REGISTRATION')).not.toBeNull();
  });
  it('limits concurrent SMS sends across replicas', async () => {
    const mobile = nextMobile();
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => security.limit(mobile, mobile, 'send')),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('invalidates SMS challenges on delivery failure without creating an account', async () => {
    const mobile = nextMobile();
    notifications.sendOtp.mockRejectedValue(new Error('timeout'));
    await service.initiateRegistration({
      firstName: 'Test',
      lastName: 'Customer',
      mobile,
      password,
      confirmPassword: password,
    });
    expect(await otp.findActive(mobile, 'REGISTRATION')).toBeNull();
    expect(await db.user.count({ where: { mobile } })).toBe(0);
  });
  it('consumes reset grants once, replaces the hash, and revokes existing sessions', async () => {
    const mobile = nextMobile();
    await service.initiateRegistration({
      firstName: 'Test',
      lastName: 'Customer',
      mobile,
      password,
      confirmPassword: password,
    });
    await service.verifyRegistration(mobile, notifications.sendOtp.mock.calls[0][2] as string);
    const user = await db.user.findUniqueOrThrow({ where: { mobile } });
    await db.refreshToken.create({
      data: { userId: user.id, tokenHash: mobile, expiresAt: new Date(Date.now() + 60000) },
    });
    await service.requestPasswordReset(mobile);
    const code = notifications.sendOtp.mock.calls.at(-1)![2] as string;
    const { resetGrant } = await service.verifyPasswordReset(mobile, code);
    const newPassword = 'New correct password 456';
    await service.resetPassword(mobile, resetGrant, newPassword, newPassword);
    await expect(
      service.resetPassword(mobile, resetGrant, newPassword, newPassword),
    ).rejects.toThrow();
    expect(await db.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    await expect(service.customerPasswordLogin(mobile, password)).rejects.toThrow();
    await expect(service.customerPasswordLogin(mobile, newPassword)).resolves.toMatchObject({
      accessToken: 'test-access',
    });
  });
});
