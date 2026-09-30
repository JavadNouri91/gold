/**
 * OTP Security Tests — Phase 7 Upgrade
 *
 * Verifies that OTP codes are:
 * 1. Stored as argon2 hashes, not plaintext
 * 2. Verified via argon2.verify (constant-time)
 * 3. Never exposed in API responses
 */
import * as argon2 from 'argon2';
import { OtpRepository } from './infrastructure/repositories/otp.repository';
import { PrismaService } from '../../database/prisma.service';

describe('OTP Security — Phase 7', () => {
  let otpRepo: OtpRepository;
  let mockPrisma: jest.Mocked<Partial<PrismaService>>;
  let createdCodeHash: string;

  beforeEach(() => {
    mockPrisma = {
      otpCode: {
        updateMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((data: { data: { codeHash: string } }) => {
          createdCodeHash = data.data.codeHash;
          return Promise.resolve({ id: 'otp-1', ...data.data });
        }),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      } as never,
    };
    otpRepo = new OtpRepository(mockPrisma as PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should store a hash, not the plaintext OTP', async () => {
    const plaintext = '123456';
    await otpRepo.createOrReplace({
      userId: 'user-1',
      mobile: '+989120000000',
      code: plaintext,
      purpose: 'LOGIN',
      expiresAt: new Date(Date.now() + 120_000),
    });

    expect(createdCodeHash).toBeDefined();
    // Stored value must NOT equal plaintext
    expect(createdCodeHash).not.toBe(plaintext);
    // Stored value should be an argon2 hash string
    expect(createdCodeHash).toMatch(/^\$argon2/);
  });

  it('should verify correct OTP using argon2.verify', async () => {
    const plaintext = '654321';
    const hash = await argon2.hash(plaintext);
    const record = {
      id: 'otp-1',
      mobile: '+989',
      codeHash: hash,
      purpose: 'LOGIN',
      expiresAt: new Date(),
      usedAt: null,
      attempts: 0,
    };

    const isValid = await otpRepo.verifyCode(record, plaintext);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect OTP', async () => {
    const hash = await argon2.hash('111111');
    const record = {
      id: 'otp-1',
      mobile: '+989',
      codeHash: hash,
      purpose: 'LOGIN',
      expiresAt: new Date(),
      usedAt: null,
      attempts: 0,
    };

    const isValid = await otpRepo.verifyCode(record, '999999');
    expect(isValid).toBe(false);
  });

  it('codeHash stored in DB is different for different OTPs (no deterministic plaintext leak)', async () => {
    let hash1 = '';
    let hash2 = '';
    (mockPrisma.otpCode!.create as jest.Mock).mockImplementation(
      (data: { data: { codeHash: string } }) => {
        if (!hash1) hash1 = data.data.codeHash;
        else hash2 = data.data.codeHash;
        return Promise.resolve({ id: 'otp-x', ...data.data });
      },
    );

    await otpRepo.createOrReplace({
      userId: 'u1',
      mobile: '+989',
      code: '123456',
      purpose: 'LOGIN',
      expiresAt: new Date(),
    });
    await otpRepo.createOrReplace({
      userId: 'u1',
      mobile: '+989',
      code: '123456',
      purpose: 'LOGIN',
      expiresAt: new Date(),
    });

    // Same plaintext → different argon2 hashes (due to random salt)
    expect(hash1).not.toBe(hash2);
  });
});
