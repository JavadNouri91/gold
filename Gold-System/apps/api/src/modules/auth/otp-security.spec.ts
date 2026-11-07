import { OtpRepository } from './infrastructure/repositories/otp.repository';
import { PrismaService } from '../../database/prisma.service';

describe('OTP keyed-hash security', () => {
  let otpRepo: OtpRepository;
  let mockPrisma: jest.Mocked<Partial<PrismaService>>;
  let createdCodeHash = '';
  const originalOtpKey = process.env.OTP_HASH_KEY;
  const originalJwtKey = process.env.JWT_ACCESS_SECRET;

  beforeEach(() => {
    process.env.OTP_HASH_KEY = 'otp-hmac-test-key-with-more-than-32-characters';
    mockPrisma = {
      otpCode: {
        updateMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((args: { data: { codeHash: string } }) => {
          createdCodeHash = args.data.codeHash;
          return Promise.resolve({ id: 'otp-1', ...args.data });
        }),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      } as never,
    };
    mockPrisma.$transaction = jest.fn(async (fn) =>
      fn({ ...mockPrisma, $executeRaw: jest.fn() }),
    ) as never;
    otpRepo = new OtpRepository(mockPrisma as PrismaService);
  });

  afterEach(() => {
    if (originalOtpKey === undefined) delete process.env.OTP_HASH_KEY;
    else process.env.OTP_HASH_KEY = originalOtpKey;
    if (originalJwtKey === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = originalJwtKey;
    jest.clearAllMocks();
  });

  it('stores a keyed digest rather than the plaintext OTP', async () => {
    await otpRepo.createOrReplace({
      userId: 'user-1',
      mobile: '09120000000',
      code: '123456',
      purpose: 'LOGIN',
      expiresAt: new Date(Date.now() + 120_000),
    });
    expect(createdCodeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createdCodeHash).not.toContain('123456');
  });

  it('verifies only for the matching mobile, purpose, and code', async () => {
    await otpRepo.createOrReplace({
      userId: 'user-1',
      mobile: '09120000000',
      code: '654321',
      purpose: 'LOGIN',
      expiresAt: new Date(Date.now() + 120_000),
    });
    const record = {
      id: 'otp-1',
      mobile: '09120000000',
      codeHash: createdCodeHash,
      purpose: 'LOGIN',
      expiresAt: new Date(),
      usedAt: null,
      attempts: 0,
    };
    expect(await otpRepo.verifyCode(record, '654321')).toBe(true);
    expect(await otpRepo.verifyCode(record, '6543210')).toBe(false);
    expect(await otpRepo.verifyCode({ ...record, mobile: '09120000001' }, '654321')).toBe(false);
    expect(await otpRepo.verifyCode({ ...record, purpose: 'REGISTRATION' }, '654321')).toBe(false);
  });
});
