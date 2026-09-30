import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';

export interface PricingCalculationRecord {
  id: string;
  referenceType: string | null;
  referenceId: string | null;
  priceSnapshotId: string;
  globalAdjId: string | null;
  pricingRuleId: string | null;
  weightGrams: Decimal;
  purityRatio: Decimal;
  customerType: string | null;
  inputDiscountAmount: Decimal;
  step1BasePrice: Decimal;
  step2AfterGlobalAdj: Decimal;
  step3PurityConvApplied: boolean;
  step4AfterWeight: Decimal;
  step5AfterGroupRule: Decimal;
  wageAmount: Decimal;
  profitAmount: Decimal | null;
  taxAmount: Decimal | null;
  discountAmount: Decimal;
  priceBeforeRounding: Decimal;
  roundingAmount: Decimal;
  finalPrice: Decimal;
  isComplete: boolean;
  blockedSteps: string[] | null;
  calculatedAt: Date;
  calculationVersion: string;
}

type CalcRow = Prisma.PricingCalculationGetPayload<Record<string, never>>;

@Injectable()
export class PricingCalculationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<PricingCalculationRecord | null> {
    const row = await this.prisma.pricingCalculation.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByReference(
    referenceType: string,
    referenceId: string,
  ): Promise<PricingCalculationRecord[]> {
    const rows = await this.prisma.pricingCalculation.findMany({
      where: { referenceType, referenceId },
      orderBy: { calculatedAt: 'desc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async create(data: PricingCalculationRecord): Promise<PricingCalculationRecord> {
    const row = await this.prisma.pricingCalculation.create({
      data: {
        id: data.id,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        priceSnapshotId: data.priceSnapshotId,
        globalAdjId: data.globalAdjId,
        pricingRuleId: data.pricingRuleId,
        weightGrams: data.weightGrams,
        purityRatio: data.purityRatio,
        customerType: data.customerType,
        inputDiscountAmount: data.inputDiscountAmount,
        step1BasePrice: data.step1BasePrice,
        step2AfterGlobalAdj: data.step2AfterGlobalAdj,
        step3PurityConvApplied: data.step3PurityConvApplied,
        step4AfterWeight: data.step4AfterWeight,
        step5AfterGroupRule: data.step5AfterGroupRule,
        wageAmount: data.wageAmount,
        profitAmount: data.profitAmount ?? null,
        taxAmount: data.taxAmount ?? null,
        discountAmount: data.discountAmount,
        priceBeforeRounding: data.priceBeforeRounding,
        roundingAmount: data.roundingAmount,
        finalPrice: data.finalPrice,
        isComplete: data.isComplete,
        blockedSteps: data.blockedSteps ?? Prisma.JsonNull,
        calculatedAt: data.calculatedAt,
        calculationVersion: data.calculationVersion,
      },
    });
    return this.toDomain(row);
  }

  private toDomain(row: CalcRow): PricingCalculationRecord {
    return {
      id: row.id,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      priceSnapshotId: row.priceSnapshotId,
      globalAdjId: row.globalAdjId,
      pricingRuleId: row.pricingRuleId,
      weightGrams: new Decimal(row.weightGrams.toString()),
      purityRatio: new Decimal(row.purityRatio.toString()),
      customerType: row.customerType,
      inputDiscountAmount: new Decimal(row.inputDiscountAmount.toString()),
      step1BasePrice: new Decimal(row.step1BasePrice.toString()),
      step2AfterGlobalAdj: new Decimal(row.step2AfterGlobalAdj.toString()),
      step3PurityConvApplied: row.step3PurityConvApplied,
      step4AfterWeight: new Decimal(row.step4AfterWeight.toString()),
      step5AfterGroupRule: new Decimal(row.step5AfterGroupRule.toString()),
      wageAmount: new Decimal(row.wageAmount.toString()),
      profitAmount: row.profitAmount ? new Decimal(row.profitAmount.toString()) : null,
      taxAmount: row.taxAmount ? new Decimal(row.taxAmount.toString()) : null,
      discountAmount: new Decimal(row.discountAmount.toString()),
      priceBeforeRounding: new Decimal(row.priceBeforeRounding.toString()),
      roundingAmount: new Decimal(row.roundingAmount.toString()),
      finalPrice: new Decimal(row.finalPrice.toString()),
      isComplete: row.isComplete,
      blockedSteps: row.blockedSteps as string[] | null,
      calculatedAt: row.calculatedAt,
      calculationVersion: row.calculationVersion,
    };
  }
}
