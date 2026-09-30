import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { PricingRuleEntity } from '../../domain/entities/pricing-rule.entity';
import { CustomerType, AdjustmentDirection } from '@gold/shared-types';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

type RuleRow = Prisma.PricingRuleGetPayload<Record<string, never>>;

@Injectable()
export class PricingRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<PricingRuleEntity | null> {
    const row = await this.prisma.pricingRule.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  /**
   * Find the highest-priority active rule for the given customer type.
   * Falls back to a default (null customerType) rule if no type-specific rule is found.
   */
  async findActiveForType(
    customerType: CustomerType,
    now = new Date(),
  ): Promise<PricingRuleEntity | null> {
    // First: type-specific rule
    const specific = await this.prisma.pricingRule.findFirst({
      where: {
        customerType,
        status: 'ACTIVE',
        activeFrom: { lte: now },
        OR: [{ activeTo: null }, { activeTo: { gte: now } }],
      },
      orderBy: { priority: 'desc' },
    });
    if (specific) return this.toDomain(specific);

    // Fallback: default rule (null customerType)
    const defaultRule = await this.prisma.pricingRule.findFirst({
      where: {
        customerType: null,
        status: 'ACTIVE',
        activeFrom: { lte: now },
        OR: [{ activeTo: null }, { activeTo: { gte: now } }],
      },
      orderBy: { priority: 'desc' },
    });
    return defaultRule ? this.toDomain(defaultRule) : null;
  }

  async list(
    params: {
      customerType?: CustomerType | null;
      activeOnly?: boolean;
      limit?: number;
    } = {},
  ): Promise<PricingRuleEntity[]> {
    const rows = await this.prisma.pricingRule.findMany({
      where: {
        ...(params.customerType !== undefined && { customerType: params.customerType }),
        ...(params.activeOnly && { status: 'ACTIVE' }),
      },
      orderBy: [{ priority: 'desc' }, { activeFrom: 'desc' }],
      take: params.limit ?? 50,
    });
    return rows.map((r) => this.toDomain(r));
  }

  async create(data: {
    name: string;
    customerType: CustomerType | null;
    groupAdjMode: string;
    groupAdjValue: Decimal;
    groupAdjDirection: string;
    wageMode: string;
    wageValue: Decimal;
    discountMode: string;
    discountValue: Decimal;
    roundingMethod: string;
    roundingPrecision: Decimal;
    priority: number;
    activeFrom: Date;
    activeTo?: Date;
    createdBy: string;
  }): Promise<PricingRuleEntity> {
    const row = await this.prisma.pricingRule.create({
      data: {
        name: data.name,
        customerType: data.customerType ?? null,
        groupAdjMode: data.groupAdjMode as never,
        groupAdjValue: data.groupAdjValue,
        groupAdjDirection: data.groupAdjDirection as never,
        wageMode: data.wageMode as never,
        wageValue: data.wageValue,
        discountMode: data.discountMode as never,
        discountValue: data.discountValue,
        roundingMethod: data.roundingMethod as never,
        roundingPrecision: data.roundingPrecision,
        priority: data.priority,
        activeFrom: data.activeFrom,
        activeTo: data.activeTo ?? null,
        status: 'ACTIVE',
        createdBy: data.createdBy,
      },
    });
    return this.toDomain(row);
  }

  private toDomain(row: RuleRow): PricingRuleEntity {
    return new PricingRuleEntity({
      id: row.id,
      name: row.name,
      customerType: row.customerType as CustomerType | null,
      groupAdjMode: row.groupAdjMode as never,
      groupAdjValue: new Decimal(row.groupAdjValue.toString()),
      groupAdjDirection: row.groupAdjDirection as AdjustmentDirection,
      wageMode: row.wageMode as never,
      wageValue: new Decimal(row.wageValue.toString()),
      discountMode: row.discountMode as never,
      discountValue: new Decimal(row.discountValue.toString()),
      roundingMethod: row.roundingMethod as never,
      roundingPrecision: new Decimal(row.roundingPrecision.toString()),
      priority: row.priority,
      activeFrom: row.activeFrom,
      activeTo: row.activeTo,
      status: row.status,
    });
  }
}
