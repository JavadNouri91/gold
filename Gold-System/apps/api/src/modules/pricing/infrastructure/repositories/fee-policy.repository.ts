import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import {
  CustomerType,
  FeeCalculationBase,
  FeeChargeCode,
  FeeMode,
  TradeSide,
} from '@gold/shared-types';
import { PrismaService } from '../../../../database/prisma.service';
import { FeePolicyEntity } from '../../domain/entities/fee-policy.entity';

type FeeRow = Prisma.CustomerTypeFeePolicyGetPayload<Record<string, never>>;

@Injectable()
export class FeePolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<FeePolicyEntity | null> {
    const row = await this.prisma.customerTypeFeePolicy.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  /**
   * Highest-priority active policy for (customerType, side, code),
   * falling back to customerType = null default.
   */
  async findActiveForType(
    customerType: CustomerType | null | undefined,
    side: TradeSide,
    code: FeeChargeCode = FeeChargeCode.TRANSACTION_FEE,
    now = new Date(),
  ): Promise<FeePolicyEntity | null> {
    if (customerType) {
      const specific = await this.prisma.customerTypeFeePolicy.findFirst({
        where: {
          customerType,
          side,
          code,
          enabled: true,
          status: 'ACTIVE',
          activeFrom: { lte: now },
          OR: [{ activeTo: null }, { activeTo: { gte: now } }],
        },
        orderBy: { priority: 'desc' },
      });
      if (specific) return this.toDomain(specific);
    }

    const defaultPolicy = await this.prisma.customerTypeFeePolicy.findFirst({
      where: {
        customerType: null,
        side,
        code,
        enabled: true,
        status: 'ACTIVE',
        activeFrom: { lte: now },
        OR: [{ activeTo: null }, { activeTo: { gte: now } }],
      },
      orderBy: { priority: 'desc' },
    });
    return defaultPolicy ? this.toDomain(defaultPolicy) : null;
  }

  async list(params: {
    customerType?: CustomerType | null;
    side?: TradeSide;
    activeOnly?: boolean;
  } = {}): Promise<FeePolicyEntity[]> {
    const rows = await this.prisma.customerTypeFeePolicy.findMany({
      where: {
        ...(params.customerType !== undefined && { customerType: params.customerType }),
        ...(params.side && { side: params.side }),
        ...(params.activeOnly && { status: 'ACTIVE' }),
      },
      orderBy: [{ side: 'asc' }, { customerType: 'asc' }, { priority: 'desc' }],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async create(data: {
    customerType: CustomerType | null;
    side: TradeSide;
    code: FeeChargeCode;
    labelFa: string;
    mode: FeeMode;
    value: Decimal;
    calculationBase: FeeCalculationBase | null;
    enabled: boolean;
    priority: number;
    activeFrom: Date;
    activeTo?: Date | null;
    createdBy: string;
  }): Promise<FeePolicyEntity> {
    const row = await this.prisma.customerTypeFeePolicy.create({
      data: {
        customerType: data.customerType,
        side: data.side,
        code: data.code,
        labelFa: data.labelFa,
        mode: data.mode,
        value: data.value,
        calculationBase: data.calculationBase,
        enabled: data.enabled,
        priority: data.priority,
        activeFrom: data.activeFrom,
        activeTo: data.activeTo ?? null,
        createdBy: data.createdBy,
      },
    });
    return this.toDomain(row);
  }

  async update(
    id: string,
    data: Partial<{
      labelFa: string;
      mode: FeeMode;
      value: Decimal;
      calculationBase: FeeCalculationBase | null;
      enabled: boolean;
      priority: number;
      activeFrom: Date;
      activeTo: Date | null;
      status: string;
      customerType: CustomerType | null;
      side: TradeSide;
    }>,
  ): Promise<FeePolicyEntity> {
    const row = await this.prisma.customerTypeFeePolicy.update({
      where: { id },
      data: {
        ...(data.labelFa !== undefined && { labelFa: data.labelFa }),
        ...(data.mode !== undefined && { mode: data.mode }),
        ...(data.value !== undefined && { value: data.value }),
        ...(data.calculationBase !== undefined && { calculationBase: data.calculationBase }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.activeFrom !== undefined && { activeFrom: data.activeFrom }),
        ...(data.activeTo !== undefined && { activeTo: data.activeTo }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.customerType !== undefined && { customerType: data.customerType }),
        ...(data.side !== undefined && { side: data.side }),
      },
    });
    return this.toDomain(row);
  }

  private toDomain(row: FeeRow): FeePolicyEntity {
    return new FeePolicyEntity({
      id: row.id,
      customerType: row.customerType as CustomerType | null,
      side: row.side as TradeSide,
      code: row.code as FeeChargeCode,
      labelFa: row.labelFa,
      mode: row.mode as FeeMode,
      value: new Decimal(row.value.toString()),
      calculationBase: (row.calculationBase as FeeCalculationBase | null) ?? null,
      enabled: row.enabled,
      priority: row.priority,
      activeFrom: row.activeFrom,
      activeTo: row.activeTo,
      status: row.status,
    });
  }
}
