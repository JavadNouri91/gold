import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AUTH_ERROR } from '../../application/auth-security.service';
import { PrismaService } from '../../../../database/prisma.service';
import { hashOtp, verifyOtpHash } from '../../../../common/crypto/otp-hash';
import { SmsSettingsService } from '../../../sms/application/sms-settings.service';

export interface OtpRecord {
  id: string;
  mobile: string;
  /** Keyed HMAC of the OTP code — plaintext is NEVER stored */
  codeHash: string;
  purpose: string;
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
  userId?: string | null;
  payload?: Prisma.JsonValue;
}

/**
 * OTP Repository
 *
 * SECURITY (Phase 7 upgrade — docs/21-business-decisions.md §11.1):
 * - OTP codes are stored as keyed HMACs — NEVER plaintext.
 * - Verification uses a constant-time comparison.
 * - OTP plaintext is never logged in production.
 * - OTP codes are never included in application logs.
 */
@Injectable()
export class OtpRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly smsSettings?: SmsSettingsService,
  ) {}

  async createOrReplace(data: {
    userId: string | null;
    mobile: string;
    code: string;
    purpose: string;
    expiresAt: Date;
    payload?: Prisma.InputJsonValue;
  }): Promise<void> {
    const codeHash = hashOtp(data.mobile, data.purpose, data.code);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.mobile + ':' + data.purpose}))`;
      await tx.otpCode.updateMany({
        where: { mobile: data.mobile, purpose: data.purpose as never, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.otpCode.create({
        data: {
          userId: data.userId,
          mobile: data.mobile,
          codeHash,
          purpose: data.purpose as never,
          expiresAt: data.expiresAt,
          payload: data.payload,
        },
      });
    });
  }

  /** Failed attempts commit; successful consumption and its effects share one transaction. */
  async consume<T>(
    mobile: string,
    purpose: string,
    code: string,
    effect: (tx: Prisma.TransactionClient, record: OtpRecord) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = (await this.smsSettings?.getOtpPolicy())?.maxAttempts ?? 5;
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${mobile + ':' + purpose}))`;
        const row = await tx.otpCode.findFirst({
          where: { mobile, purpose: purpose as never, usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        });
        if (!row || row.attempts >= maxAttempts) return { ok: false as const };
        await tx.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
        if (!verifyOtpHash(row.codeHash, mobile, purpose, code)) return { ok: false as const };
        await tx.otpCode.update({
          where: { id: row.id },
          data: { usedAt: new Date(), payload: Prisma.DbNull },
        });
        return { ok: true as const, value: await effect(tx, row) };
      },
      { timeout: 15_000 },
    );
    if (!result.ok) throw new UnauthorizedException(AUTH_ERROR);
    return result.value;
  }

  async invalidate(mobile: string, purpose: string) {
    await this.prisma.otpCode.updateMany({
      where: { mobile, purpose: purpose as never, usedAt: null },
      data: { usedAt: new Date(), payload: Prisma.DbNull },
    });
  }

  async findActive(mobile: string, purpose: string): Promise<OtpRecord | null> {
    const record = await this.prisma.otpCode.findFirst({
      where: {
        mobile,
        purpose: purpose as never,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    return record as OtpRecord | null;
  }

  /**
   * Verify a plaintext OTP against its keyed hash without logging the code.
   */
  async verifyCode(record: OtpRecord, plaintext: string): Promise<boolean> {
    return verifyOtpHash(record.codeHash, record.mobile, record.purpose, plaintext);
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.prisma.otpCode.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  async markUsed(id: string): Promise<void> {
    await this.prisma.otpCode.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}
