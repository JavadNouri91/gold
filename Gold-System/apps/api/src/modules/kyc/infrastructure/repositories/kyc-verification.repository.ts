import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { KYCVerificationEntity } from '../../domain/entities/kyc-verification.entity';
import { VerificationStatus } from '@gold/shared-types';
import { Prisma } from '@prisma/client';

type VerificationRow = Prisma.KYCVerificationGetPayload<Record<string, never>>;

@Injectable()
export class KycVerificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<KYCVerificationEntity | null> {
    const row = await this.prisma.kYCVerification.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findLatestByCustomerId(customerId: string): Promise<KYCVerificationEntity | null> {
    const row = await this.prisma.kYCVerification.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.toDomain(row) : null;
  }

  async findAllByCustomerId(customerId: string): Promise<KYCVerificationEntity[]> {
    const rows = await this.prisma.kYCVerification.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  /** Create a new KYC verification record (PENDING) */
  async create(customerId: string): Promise<KYCVerificationEntity> {
    const row = await this.prisma.kYCVerification.create({
      data: {
        customerId,
        status: 'PENDING',
      },
    });
    return this.toDomain(row);
  }

  /** Transition status + set reviewer + decision reason */
  async updateStatus(
    id: string,
    status: VerificationStatus,
    reviewerId?: string,
    decisionReason?: string,
  ): Promise<KYCVerificationEntity> {
    const row = await this.prisma.kYCVerification.update({
      where: { id },
      data: {
        status,
        reviewerId: reviewerId ?? undefined,
        decisionReason: decisionReason ?? null,
        reviewedAt: reviewerId ? new Date() : undefined,
        updatedAt: new Date(),
      },
    });
    return this.toDomain(row);
  }

  private toDomain(row: VerificationRow): KYCVerificationEntity {
    return new KYCVerificationEntity({
      id: row.id,
      customerId: row.customerId,
      status: row.status as VerificationStatus,
      reviewerId: row.reviewerId,
      decisionReason: row.decisionReason,
      reviewedAt: row.reviewedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
