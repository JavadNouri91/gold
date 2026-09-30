import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { Prisma } from '@prisma/client';

export interface PriceSourceRecord {
  id: string;
  name: string;
  providerType: string;
  config: Record<string, unknown> | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PriceSourceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByName(name: string): Promise<PriceSourceRecord | null> {
    return this.prisma.priceSource.findUnique({
      where: { name },
    }) as Promise<PriceSourceRecord | null>;
  }

  async findActive(): Promise<PriceSourceRecord[]> {
    return this.prisma.priceSource.findMany({
      where: { status: 'ACTIVE' },
    }) as Promise<PriceSourceRecord[]>;
  }

  async upsert(data: {
    name: string;
    providerType: string;
    config?: Record<string, unknown>;
  }): Promise<PriceSourceRecord> {
    return this.prisma.priceSource.upsert({
      where: { name: data.name },
      update: {
        providerType: data.providerType,
        config: (data.config as Prisma.InputJsonObject) ?? undefined,
      },
      create: {
        name: data.name,
        providerType: data.providerType,
        config: (data.config as Prisma.InputJsonObject) ?? undefined,
        status: 'ACTIVE',
      },
    }) as Promise<PriceSourceRecord>;
  }
}
