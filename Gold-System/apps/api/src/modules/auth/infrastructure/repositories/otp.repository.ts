import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../../../database/prisma.service';

export interface OtpRecord {
  id: string;
  mobile: string;
  /** argon2 hash of the OTP code — plaintext is NEVER stored */
  codeHash: string;
  purpose: string;
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
}

/**
 * OTP Repository
 *
 * SECURITY (Phase 7 upgrade — docs/21-business-decisions.md §11.1):
 * - OTP codes are stored as argon2id hashes — NEVER plaintext.
 * - Verification uses argon2.verify() — constant-time comparison.
 * - OTP plaintext is never logged in production.
 * - The mock SMS provider logs OTP only in development/test mode.
 */
@Injectable()
export class OtpRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createOrReplace(data: {
    userId: string;
    mobile: string;
    /** Plaintext OTP — will be hashed before storage */
    code: string;
    purpose: string;
    expiresAt: Date;
  }): Promise<void> {
    // Invalidate any existing unused OTPs for this mobile+purpose
    await this.prisma.otpCode.updateMany({
      where: {
        mobile: data.mobile,
        purpose: data.purpose as never,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    // Hash the OTP before storing — plaintext NEVER hits the DB
    const codeHash = await argon2.hash(data.code);

    await this.prisma.otpCode.create({
      data: {
        userId: data.userId,
        mobile: data.mobile,
        codeHash,
        purpose: data.purpose as never,
        expiresAt: data.expiresAt,
      },
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
   * Verify a plaintext OTP against the stored hash.
   * Uses argon2.verify() — constant-time; safe against timing attacks.
   */
  async verifyCode(record: OtpRecord, plaintext: string): Promise<boolean> {
    return argon2.verify(record.codeHash, plaintext);
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
