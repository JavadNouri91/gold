import { Injectable, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { CustomerType } from '@gold/shared-types';
import {
  PricingEngineService,
  PricingEngineInput,
  PricingEngineResult,
} from './pricing-engine.service';
import { PriceSnapshotRepository } from '../infrastructure/repositories/price-snapshot.repository';
import { PriceAdjustmentRepository } from '../infrastructure/repositories/price-adjustment.repository';
import { PricingRuleRepository } from '../infrastructure/repositories/pricing-rule.repository';
import { PricingCalculationRepository } from '../infrastructure/repositories/pricing-calculation.repository';
import { AuditService } from '../../audit/application/audit.service';
import { CalculatePriceDto } from './dto/calculate-price.dto';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { CreatePriceAdjustmentDto } from './dto/create-price-adjustment.dto';
import { NoPriceAvailableError } from '../domain/exceptions/pricing.exceptions';

// ─── Response shape ───────────────────────────────────────────────────────────

export class PricingResultResponseDto {
  calculationId: string;

  /** Step-by-step pipeline values (all Decimal-as-string) */
  pipeline: {
    step1_basePrice: string;
    step2_afterGlobalAdj: string;
    step3_purityConv: 'DEFERRED';
    step4_afterWeight: string;
    step5_afterGroupRule: string;
    wageAmount: string;
    /** null — BLOCKED on §13.2 */
    profitAmount: null;
    /** null — BLOCKED on §13.3 */
    taxAmount: null;
    discountAmount: string;
    priceBeforeRounding: string;
    roundingAmount: string;
    finalPrice: string;
  };

  isComplete: false;
  blockedSteps: string[];

  meta: {
    snapshotId: string;
    globalAdjId: string | null;
    pricingRuleId: string | null;
    weightGrams: string;
    purityRatio: string;
    customerType: CustomerType | null;
  };

  static from(
    result: PricingEngineResult,
    input: { weightGrams: Decimal; purityRatio: Decimal; customerType?: CustomerType },
  ): PricingResultResponseDto {
    const dto = new PricingResultResponseDto();
    dto.calculationId = result.calculationId;
    dto.pipeline = {
      step1_basePrice: result.step1BasePrice.toFixed(2),
      step2_afterGlobalAdj: result.step2AfterGlobalAdj.toFixed(2),
      step3_purityConv: 'DEFERRED',
      step4_afterWeight: result.step4AfterWeight.toFixed(2),
      step5_afterGroupRule: result.step5AfterGroupRule.toFixed(2),
      wageAmount: result.wageAmount.toFixed(2),
      profitAmount: null,
      taxAmount: null,
      discountAmount: result.discountAmount.toFixed(2),
      priceBeforeRounding: result.priceBeforeRounding.toFixed(2),
      roundingAmount: result.roundingAmount.toFixed(2),
      finalPrice: result.finalPrice.toFixed(2),
    };
    dto.isComplete = false;
    dto.blockedSteps = result.blockedSteps;
    dto.meta = {
      snapshotId: result.snapshotId,
      globalAdjId: result.globalAdjId,
      pricingRuleId: result.pricingRuleId,
      weightGrams: input.weightGrams.toFixed(6),
      purityRatio: input.purityRatio.toFixed(6),
      customerType: input.customerType ?? null,
    };
    return dto;
  }
}

// ─── PricingService ────────────────────────────────────────────────────────────

@Injectable()
export class PricingService {
  constructor(
    private readonly engine: PricingEngineService,
    private readonly snapshotRepo: PriceSnapshotRepository,
    private readonly adjRepo: PriceAdjustmentRepository,
    private readonly ruleRepo: PricingRuleRepository,
    private readonly calcRepo: PricingCalculationRepository,
    private readonly audit: AuditService,
  ) {}

  // ── UC-06: Get current live price ─────────────────────────────────────────
  async getCurrentPrice() {
    const snapshot = await this.snapshotRepo.findLatestValid();
    if (!snapshot) throw new NoPriceAvailableError();
    const ttlRaw = Number(this.engine.getSnapshotTtlSeconds());
    const ttlSeconds = Number.isFinite(ttlRaw) && ttlRaw > 0 ? ttlRaw : null;
    const expiresAt =
      ttlSeconds == null
        ? null
        : new Date(snapshot.capturedAt.getTime() + ttlSeconds * 1000).toISOString();
    return {
      snapshotId: snapshot.id,
      normalizedValue: snapshot.normalizedValue.toFixed(2),
      unit: snapshot.unit,
      currency: snapshot.currency,
      capturedAt: snapshot.capturedAt,
      validityStatus: snapshot.validityStatus,
      purityReference: snapshot.purityReference,
      /** When this snapshot fails the pricing-engine TTL check. */
      expiresAt,
      ttlSeconds,
    };
  }

  // ── On-demand price refresh ────────────────────────────────────────────────
  async refreshPrice() {
    const snapshot = await this.engine.fetchAndSnapshot();
    return {
      snapshotId: snapshot.id,
      normalizedValue: snapshot.normalizedValue.toFixed(2),
      unit: snapshot.unit,
      capturedAt: snapshot.capturedAt,
    };
  }

  // ── Calculate price ────────────────────────────────────────────────────────
  async calculate(
    dto: CalculatePriceDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<PricingResultResponseDto> {
    const weightGrams = new Decimal(dto.weightGrams);
    const purityRatio = new Decimal(dto.purityRatio);
    const orderLevelDiscount = dto.orderLevelDiscountAmount
      ? new Decimal(dto.orderLevelDiscountAmount)
      : undefined;

    const engineInput: PricingEngineInput = {
      weightGrams,
      purityRatio,
      customerType: dto.customerType,
      priceSnapshotId: dto.priceSnapshotId,
      orderLevelDiscountAmount: orderLevelDiscount,
      referenceType: 'MANUAL',
    };

    const result = await this.engine.calculate(engineInput);

    await this.audit.log({
      actorId,
      action: 'PRICE_CALCULATED',
      entityType: 'PricingCalculation',
      entityId: result.calculationId,
      after: {
        weightGrams: weightGrams.toFixed(6),
        customerType: dto.customerType ?? null,
        finalPrice: result.finalPrice.toFixed(2),
        isComplete: false,
        blockedSteps: result.blockedSteps,
      },
      ipAddress,
    });

    return PricingResultResponseDto.from(result, {
      weightGrams,
      purityRatio,
      customerType: dto.customerType,
    });
  }

  // ── Get calculation by ID ──────────────────────────────────────────────────
  async getCalculation(id: string) {
    const calc = await this.calcRepo.findById(id);
    if (!calc) throw new NotFoundException(`PricingCalculation ${id} not found`);
    return {
      id: calc.id,
      finalPrice: calc.finalPrice.toFixed(2),
      isComplete: calc.isComplete,
      blockedSteps: calc.blockedSteps,
      step1BasePrice: calc.step1BasePrice.toFixed(6),
      step2AfterGlobalAdj: calc.step2AfterGlobalAdj.toFixed(6),
      step3PurityConvApplied: calc.step3PurityConvApplied,
      step4AfterWeight: calc.step4AfterWeight.toFixed(2),
      step5AfterGroupRule: calc.step5AfterGroupRule.toFixed(2),
      wageAmount: calc.wageAmount.toFixed(2),
      profitAmount: null,
      taxAmount: null,
      discountAmount: calc.discountAmount.toFixed(2),
      priceBeforeRounding: calc.priceBeforeRounding.toFixed(2),
      roundingAmount: calc.roundingAmount.toFixed(2),
      snapshotId: calc.priceSnapshotId,
      globalAdjId: calc.globalAdjId,
      pricingRuleId: calc.pricingRuleId,
      weightGrams: calc.weightGrams.toFixed(6),
      purityRatio: calc.purityRatio.toFixed(6),
      customerType: calc.customerType,
      calculatedAt: calc.calculatedAt,
      calculationVersion: calc.calculationVersion,
    };
  }

  // ── Pricing rules management ───────────────────────────────────────────────
  async listRules(customerType?: CustomerType) {
    const rules = await this.ruleRepo.list({ customerType });
    return rules.map((r) => ({
      id: r.id,
      name: r.name,
      customerType: r.customerType,
      groupAdjMode: r.groupAdjMode,
      groupAdjValue: r.groupAdjValue.toFixed(6),
      groupAdjDirection: r.groupAdjDirection,
      wageMode: r.wageMode,
      wageValue: r.wageValue.toFixed(6),
      discountMode: r.discountMode,
      discountValue: r.discountValue.toFixed(6),
      roundingMethod: r.roundingMethod,
      roundingPrecision: r.roundingPrecision.toFixed(2),
      priority: r.priority,
      activeFrom: r.activeFrom,
      activeTo: r.activeTo,
      status: r.status,
    }));
  }

  async createRule(dto: CreatePricingRuleDto, actorId: string): Promise<object> {
    const rule = await this.ruleRepo.create({
      name: dto.name,
      customerType: dto.customerType ?? null,
      groupAdjMode: dto.groupAdjMode ?? 'NONE',
      groupAdjValue: new Decimal(dto.groupAdjValue ?? '0'),
      groupAdjDirection: dto.groupAdjDirection ?? 'INCREASE',
      wageMode: dto.wageMode ?? 'NONE',
      wageValue: new Decimal(dto.wageValue ?? '0'),
      discountMode: dto.discountMode ?? 'NONE',
      discountValue: new Decimal(dto.discountValue ?? '0'),
      roundingMethod: dto.roundingMethod ?? 'NONE',
      roundingPrecision: new Decimal(dto.roundingPrecision ?? '1'),
      priority: dto.priority ?? 0,
      activeFrom: new Date(dto.activeFrom),
      activeTo: dto.activeTo ? new Date(dto.activeTo) : undefined,
      createdBy: actorId,
    });

    await this.audit.log({
      actorId,
      action: 'PRICING_RULE_CREATED',
      entityType: 'PricingRule',
      entityId: rule.id,
      after: { name: rule.name, customerType: rule.customerType },
    });

    return { id: rule.id, name: rule.name, customerType: rule.customerType };
  }

  // ── Price adjustments management ───────────────────────────────────────────
  async listAdjustments() {
    const adjs = await this.adjRepo.list();
    return adjs.map((a) => ({
      id: a.id,
      name: a.name,
      mode: a.mode,
      direction: a.direction,
      value: a.value.toFixed(6),
      effectiveFrom: a.effectiveFrom,
      effectiveTo: a.effectiveTo,
      status: a.status,
      isActive: a.isActive(),
    }));
  }

  async createAdjustment(dto: CreatePriceAdjustmentDto, actorId: string): Promise<object> {
    const adj = await this.adjRepo.create({
      name: dto.name,
      mode: dto.mode,
      direction: dto.direction,
      value: new Decimal(dto.value),
      effectiveFrom: new Date(dto.effectiveFrom),
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      createdBy: actorId,
    });

    await this.audit.log({
      actorId,
      action: 'PRICE_ADJUSTMENT_CREATED',
      entityType: 'PriceAdjustment',
      entityId: adj.id,
      after: {
        name: adj.name,
        mode: adj.mode,
        direction: adj.direction,
        value: adj.value.toFixed(6),
      },
    });

    return {
      id: adj.id,
      name: adj.name,
      mode: adj.mode,
      direction: adj.direction,
      value: adj.value.toFixed(6),
    };
  }
}
