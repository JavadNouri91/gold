import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { CustomerDocumentEntity } from '../../domain/entities/customer-document.entity';
import { VerificationStatus } from '@gold/shared-types';
import { Prisma } from '@prisma/client';

type DocumentRow = Prisma.CustomerDocumentGetPayload<Record<string, never>>;

@Injectable()
export class CustomerDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CustomerDocumentEntity | null> {
    const row = await this.prisma.customerDocument.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByCustomerId(customerId: string): Promise<CustomerDocumentEntity[]> {
    const rows = await this.prisma.customerDocument.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async create(data: {
    customerId: string;
    documentType: string;
    fileKey: string;
    fileName: string;
    fileMimeType: string;
    fileSizeBytes: number;
  }): Promise<CustomerDocumentEntity> {
    const row = await this.prisma.customerDocument.create({
      data: {
        customerId: data.customerId,
        documentType: data.documentType,
        fileKey: data.fileKey,
        fileName: data.fileName,
        fileMimeType: data.fileMimeType,
        fileSizeBytes: data.fileSizeBytes,
        status: 'PENDING',
      },
    });
    return this.toDomain(row);
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.customerDocument.delete({ where: { id } });
  }

  async updateStatus(
    id: string,
    status: VerificationStatus,
    reviewedBy?: string,
    rejectionReason?: string,
  ): Promise<CustomerDocumentEntity> {
    const row = await this.prisma.customerDocument.update({
      where: { id },
      data: {
        status,
        reviewedBy: reviewedBy ?? undefined,
        reviewedAt: reviewedBy ? new Date() : undefined,
        rejectionReason: rejectionReason ?? null,
        updatedAt: new Date(),
      },
    });
    return this.toDomain(row);
  }

  private toDomain(row: DocumentRow): CustomerDocumentEntity {
    return new CustomerDocumentEntity({
      id: row.id,
      customerId: row.customerId,
      documentType: row.documentType,
      fileKey: row.fileKey,
      fileName: row.fileName,
      fileMimeType: row.fileMimeType,
      fileSizeBytes: row.fileSizeBytes,
      status: row.status as VerificationStatus,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      rejectionReason: row.rejectionReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
