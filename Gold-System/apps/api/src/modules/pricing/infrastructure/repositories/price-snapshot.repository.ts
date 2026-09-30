import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import {
  PriceSnapshotEntity,
  PriceSnapshotStatus,
} from '../../domain/entities/price-snapshot.entity';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';

type SnapshotRow = Prisma.PriceSnapshotGetPayload<Record<string, never>>;

@Injectable()
export class PriceSnapshotRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<PriceSnapshotEntity | null> {
    const row = await this.prisma.priceSnapshot.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  /** Latest VALID snapshot across all sources */
  async findLatestValid(): Promise<PriceSnapshotEntity | null> {
    const row = await this.prisma.priceSnapshot.findFirst({
      where: { validityStatus: 'VALID' },
      orderBy: { capturedAt: 'desc' },
    });
    return row ? this.toDomain(row) : null;
  }

  /** Latest VALID snapshot for a specific source */
  async findLatestValidBySource(sourceId: string): Promise<PriceSnapshotEntity | null> {
    const row = await this.prisma.priceSnapshot.findFirst({
      where: { sourceId, validityStatus: 'VALID' },
      orderBy: { capturedAt: 'desc' },
    });
    return row ? this.toDomain(row) : null;
  }

  async create(data: {
    sourceId: string;
    rawValue: Decimal;
    normalizedValue: Decimal;
    unit: string;
    currency: string;
    purityReference: string | null;
    externalRef: string | null;
    metadata: Record<string, unknown> | null;
    capturedAt: Date;
  }): Promise<PriceSnapshotEntity> {
    const row = await this.prisma.priceSnapshot.create({
      data: {
        sourceId: data.sourceId,
        rawValue: data.rawValue,
        normalizedValue: data.normalizedValue,
        unit: data.unit,
        currency: data.currency,
        purityReference: data.purityReference,
        externalRef: data.externalRef,
        metadata: (data.metadata as Prisma.InputJsonObject) ?? Prisma.JsonNull,
        capturedAt: data.capturedAt,
        validityStatus: 'VALID',
      },
    });
    return this.toDomain(row);
  }

  /** Mark a snapshot as STALE or INVALID */
  async updateStatus(id: string, status: PriceSnapshotStatus): Promise<PriceSnapshotEntity> {
    const row = await this.prisma.priceSnapshot.update({
      where: { id },
      data: { validityStatus: status },
    });
    return this.toDomain(row);
  }

  /** Mark all previous VALID snapshots of a source as STALE */
  async markPreviousAsStale(sourceId: string, exceptId: string): Promise<void> {
    await this.prisma.priceSnapshot.updateMany({
      where: {
        sourceId,
        validityStatus: 'VALID',
        id: { not: exceptId },
      },
      data: { validityStatus: 'STALE' },
    });
  }

  async list(params: {
    sourceId?: string;
    status?: PriceSnapshotStatus;
    limit?: number;
  }): Promise<PriceSnapshotEntity[]> {
    const rows = await this.prisma.priceSnapshot.findMany({
      where: {
        ...(params.sourceId && { sourceId: params.sourceId }),
        ...(params.status && { validityStatus: params.status }),
      },
      orderBy: { capturedAt: 'desc' },
      take: params.limit ?? 20,
    });
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: SnapshotRow): PriceSnapshotEntity {
    return new PriceSnapshotEntity({
      id: row.id,
      sourceId: row.sourceId,
      rawValue: new Decimal(row.rawValue.toString()),
      normalizedValue: new Decimal(row.normalizedValue.toString()),
      unit: row.unit,
      currency: row.currency,
      purityReference: row.purityReference,
      externalRef: row.externalRef,
      metadata: row.metadata as Record<string, unknown> | null,
      capturedAt: row.capturedAt,
      validityStatus: row.validityStatus as PriceSnapshotStatus,
      createdAt: row.createdAt,
    });
  }
}
