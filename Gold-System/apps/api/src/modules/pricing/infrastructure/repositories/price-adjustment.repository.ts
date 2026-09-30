import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { PriceAdjustmentEntity } from '../../domain/entities/price-adjustment.entity';
import { AdjustmentMode, AdjustmentDirection } from '@gold/shared-types';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

type AdjRow = Prisma.PriceAdjustmentGetPayload<Record<string, never>>;

@Injectable()
export class PriceAdjustmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<PriceAdjustmentEntity | null> {
    const row = await this.prisma.priceAdjustment.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  /** Find the currently active global seller adjustment */
  async findActiveGlobal(now = new Date()): Promise<PriceAdjustmentEntity | null> {
    const row = await this.prisma.priceAdjustment.findFirst({
      where: {
        status: 'ACTIVE',
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    return row ? this.toDomain(row) : null;
  }

  async list(params: { activeOnly?: boolean } = {}): Promise<PriceAdjustmentEntity[]> {
    const rows = await this.prisma.priceAdjustment.findMany({
      where: params.activeOnly ? { status: 'ACTIVE' } : undefined,
      orderBy: { effectiveFrom: 'desc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async create(data: {
    name: string;
    mode: AdjustmentMode;
    direction: AdjustmentDirection;
    value: Decimal;
    effectiveFrom: Date;
    effectiveTo?: Date;
    createdBy: string;
  }): Promise<PriceAdjustmentEntity> {
    const row = await this.prisma.priceAdjustment.create({
      data: {
        name: data.name,
        mode: data.mode,
        direction: data.direction,
        value: data.value,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo ?? null,
        status: 'ACTIVE',
        createdBy: data.createdBy,
      },
    });
    return this.toDomain(row);
  }

  private toDomain(row: AdjRow): PriceAdjustmentEntity {
    return new PriceAdjustmentEntity({
      id: row.id,
      name: row.name,
      mode: row.mode as AdjustmentMode,
      direction: row.direction as AdjustmentDirection,
      value: new Decimal(row.value.toString()),
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      status: row.status,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
