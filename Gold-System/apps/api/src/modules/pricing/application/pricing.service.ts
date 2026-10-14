import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import {
  CustomerType,
  FeeCalculationBase,
  FeeChargeCode,
  FeeMode,
  TradeSide,
} from '@gold/shared-types';
import {
  PricingEngineService,
  PricingEngineInput,
  PricingEngineResult,
} from './pricing-engine.service';
import { PriceSnapshotRepository } from '../infrastructure/repositories/price-snapshot.repository';
import { PriceAdjustmentRepository } from '../infrastructure/repositories/price-adjustment.repository';
import { PricingRuleRepository } from '../infrastructure/repositories/pricing-rule.repository';
import { PricingCalculationRepository } from '../infrastructure/repositories/pricing-calculation.repository';
import { FeePolicyRepository } from '../infrastructure/repositories/fee-policy.repository';
import { AuditService } from '../../audit/application/audit.service';
import { PrismaService } from '../../../database/prisma.service';
import { CalculatePriceDto } from './dto/calculate-price.dto';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { CreatePriceAdjustmentDto } from './dto/create-price-adjustment.dto';
import {
  CreateFeePolicyDto,
  UpdateFeePolicyDto,
} from './dto/create-fee-policy.dto';
import { PriceSnapshotEntity } from '../domain/entities/price-snapshot.entity';
import { NoPriceAvailableError } from '../domain/exceptions/pricing.exceptions';
import {
  FeeBreakdown,
  TransactionFeeService,
} from './transaction-fee.service';
import { CurrentUserData } from '../../../common/decorators/current-user.decorator';

// ─── Response shape ───────────────────────────────────────────────────────────

export class ChargeLineDto {
  code: string;
  labelFa: string;
  side: string;
  mode: string;
  rateValue: string;
  calculationBase: string | null;
  baseAmount: string;
  amount: string;
}

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
    /** Gold commercial total — does NOT include transaction fees */
    finalPrice: string;
  };

  /** Transaction fee charges (separate from wage) */
  charges: ChargeLineDto[];
  goldCommercialRial: string;
  feeTotalRial: string;
  /** BUY payable; SELL receivable */
  customerTotalRial: string;
  payableRial: string | null;
  receivableRial: string | null;
  side: TradeSide;

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
    input: { weightGrams: Decimal; purityRatio: Decimal; customerType?: CustomerType | null },
    fees: FeeBreakdown,
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
    dto.charges = fees.charges.map((c) => ({
      code: c.code,
      labelFa: c.labelFa,
      side: c.side,
      mode: c.mode,
      rateValue: c.rateValue.toFixed(6),
      calculationBase: c.calculationBase,
      baseAmount: c.baseAmount.toFixed(2),
      amount: c.amount.toFixed(2),
    }));
    dto.goldCommercialRial = fees.goldCommercialRial.toFixed(2);
    dto.feeTotalRial = fees.feeTotalRial.toFixed(2);
    dto.customerTotalRial = fees.customerTotalRial.toFixed(2);
    dto.payableRial = fees.payableRial?.toFixed(2) ?? null;
    dto.receivableRial = fees.receivableRial?.toFixed(2) ?? null;
    dto.side = fees.side;
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
  /** Shared refresh so concurrent price reads do not each write a snapshot. */
  private liveRefresh: Promise<PriceSnapshotEntity> | null = null;

  constructor(
    private readonly engine: PricingEngineService,
    private readonly snapshotRepo: PriceSnapshotRepository,
    private readonly adjRepo: PriceAdjustmentRepository,
    private readonly ruleRepo: PricingRuleRepository,
    private readonly calcRepo: PricingCalculationRepository,
    private readonly feeRepo: FeePolicyRepository,
    private readonly feeService: TransactionFeeService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── UC-06: Get current live price ─────────────────────────────────────────
  async getCurrentPrice() {
    const ttlSeconds = this.snapshotTtlSeconds();
    let snapshot = await this.snapshotRepo.findLatestValid();
    const stale = !snapshot || (ttlSeconds != null && !snapshot.isWithinTtl(ttlSeconds));
    if (stale) {
      snapshot = await this.refreshLiveSnapshot(snapshot);
    }
    if (!snapshot) throw new NoPriceAvailableError();
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

  /**
   * Pull a fresh snapshot from the configured provider (currently the temporary
   * mock price) when the stored snapshot is missing or past its TTL.
   * Falls back to the previous snapshot if the provider call fails.
   */
  private async refreshLiveSnapshot(
    fallback: PriceSnapshotEntity | null,
  ): Promise<PriceSnapshotEntity | null> {
    if (!this.liveRefresh) {
      this.liveRefresh = this.engine.fetchAndSnapshot().finally(() => {
        this.liveRefresh = null;
      });
    }
    try {
      return await this.liveRefresh;
    } catch {
      return fallback;
    }
  }

  private snapshotTtlSeconds(): number | null {
    const ttlRaw = Number(this.engine.getSnapshotTtlSeconds());
    return Number.isFinite(ttlRaw) && ttlRaw > 0 ? ttlRaw : null;
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
    actor: CurrentUserData,
    ipAddress?: string,
  ): Promise<PricingResultResponseDto> {
    const weightGrams = new Decimal(dto.weightGrams);
    const purityRatio = new Decimal(dto.purityRatio);
    const orderLevelDiscount = dto.orderLevelDiscountAmount
      ? new Decimal(dto.orderLevelDiscountAmount)
      : undefined;
    const side = dto.side ?? TradeSide.BUY;

    // Portal customers: always use DB customer type (ignore client spoof).
    // Staff with pricing.rules.manage may pass customerType for preview.
    const isStaffPreview = actor.permissions.includes('pricing.rules.manage');
    let customerType: CustomerType | null | undefined = dto.customerType;
    if (!isStaffPreview) {
      const customer = await this.prisma.customer.findUnique({
        where: { userId: actor.userId },
        select: { type: true },
      });
      customerType = (customer?.type as CustomerType | null) ?? null;
    }

    const engineInput: PricingEngineInput = {
      weightGrams,
      purityRatio,
      customerType: customerType ?? undefined,
      priceSnapshotId: dto.priceSnapshotId,
      orderLevelDiscountAmount: orderLevelDiscount,
      referenceType: 'MANUAL',
    };

    const result = await this.engine.calculate(engineInput);

    const fees = await this.feeService.compute(customerType, side, {
      step4AfterWeight: result.step4AfterWeight,
      step5AfterGroupRule: result.step5AfterGroupRule,
      goldCommercialRial: result.finalPrice,
    });

    await this.audit.log({
      actorId: actor.userId,
      action: 'PRICE_CALCULATED',
      entityType: 'PricingCalculation',
      entityId: result.calculationId,
      after: {
        weightGrams: weightGrams.toFixed(6),
        customerType: customerType ?? null,
        side,
        finalPrice: result.finalPrice.toFixed(2),
        feeTotalRial: fees.feeTotalRial.toFixed(2),
        customerTotalRial: fees.customerTotalRial.toFixed(2),
        isComplete: false,
        blockedSteps: result.blockedSteps,
      },
      ipAddress,
    });

    return PricingResultResponseDto.from(
      result,
      { weightGrams, purityRatio, customerType },
      fees,
    );
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

  // ── Fee policies (customer-type BUY/SELL transaction fees) ─────────────────

  private validateFeePolicyInput(mode: FeeMode, value: Decimal, base?: FeeCalculationBase | null) {
    if (value.lt(0)) {
      throw new BadRequestException('Fee value must be non-negative');
    }
    if (mode === FeeMode.PERCENTAGE) {
      if (!base) {
        throw new BadRequestException('PERCENTAGE fees require calculationBase');
      }
      if (value.gt(100)) {
        throw new BadRequestException('Percentage fee cannot exceed 100');
      }
    }
    if ((mode === FeeMode.FIXED || mode === FeeMode.NONE) && base) {
      throw new BadRequestException('calculationBase must be null when mode is FIXED or NONE');
    }
  }

  private serializeFeePolicy(p: {
    id: string;
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
    activeTo: Date | null;
    status: string;
  }) {
    return {
      id: p.id,
      customerType: p.customerType,
      side: p.side,
      code: p.code,
      labelFa: p.labelFa,
      mode: p.mode,
      value: p.value.toFixed(6),
      calculationBase: p.calculationBase,
      enabled: p.enabled,
      priority: p.priority,
      activeFrom: p.activeFrom,
      activeTo: p.activeTo,
      status: p.status,
    };
  }

  async listFeePolicies(params?: { customerType?: CustomerType; side?: TradeSide }) {
    const policies = await this.feeRepo.list({
      customerType: params?.customerType,
      side: params?.side,
    });
    return policies.map((p) => this.serializeFeePolicy(p));
  }

  async createFeePolicy(dto: CreateFeePolicyDto, actorId: string) {
    const mode = dto.mode;
    const value = new Decimal(dto.value);
    const calculationBase =
      mode === FeeMode.PERCENTAGE
        ? (dto.calculationBase ?? FeeCalculationBase.GOLD_COMMERCIAL_TOTAL)
        : null;
    this.validateFeePolicyInput(mode, value, calculationBase);

    const defaultLabel =
      dto.side === TradeSide.BUY ? 'کارمزد خرید' : 'کارمزد فروش';

    const policy = await this.feeRepo.create({
      customerType: dto.customerType ?? null,
      side: dto.side,
      code: dto.code ?? FeeChargeCode.TRANSACTION_FEE,
      labelFa: dto.labelFa ?? defaultLabel,
      mode,
      value,
      calculationBase,
      enabled: dto.enabled ?? true,
      priority: dto.priority ?? 0,
      activeFrom: new Date(dto.activeFrom),
      activeTo: dto.activeTo ? new Date(dto.activeTo) : null,
      createdBy: actorId,
    });

    await this.audit.log({
      actorId,
      action: 'FEE_POLICY_CREATED',
      entityType: 'CustomerTypeFeePolicy',
      entityId: policy.id,
      after: this.serializeFeePolicy(policy),
    });

    return this.serializeFeePolicy(policy);
  }

  async updateFeePolicy(id: string, dto: UpdateFeePolicyDto, actorId: string) {
    const existing = await this.feeRepo.findById(id);
    if (!existing) throw new NotFoundException(`Fee policy ${id} not found`);

    const mode = dto.mode ?? existing.mode;
    const value = dto.value !== undefined ? new Decimal(dto.value) : existing.value;
    let calculationBase: FeeCalculationBase | null;
    if (mode === FeeMode.PERCENTAGE) {
      calculationBase =
        dto.calculationBase !== undefined
          ? dto.calculationBase
          : (existing.calculationBase ?? FeeCalculationBase.GOLD_COMMERCIAL_TOTAL);
    } else {
      calculationBase = null;
    }
    this.validateFeePolicyInput(mode, value, calculationBase);

    const updated = await this.feeRepo.update(id, {
      ...(dto.customerType !== undefined && { customerType: dto.customerType }),
      ...(dto.side !== undefined && { side: dto.side }),
      ...(dto.labelFa !== undefined && { labelFa: dto.labelFa }),
      mode,
      value,
      calculationBase,
      ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      ...(dto.priority !== undefined && { priority: dto.priority }),
      ...(dto.activeFrom !== undefined && { activeFrom: new Date(dto.activeFrom) }),
      ...(dto.activeTo !== undefined && {
        activeTo: dto.activeTo ? new Date(dto.activeTo) : null,
      }),
      ...(dto.status !== undefined && { status: dto.status }),
    });

    await this.audit.log({
      actorId,
      action: 'FEE_POLICY_UPDATED',
      entityType: 'CustomerTypeFeePolicy',
      entityId: id,
      before: this.serializeFeePolicy(existing),
      after: this.serializeFeePolicy(updated),
    });

    return this.serializeFeePolicy(updated);
  }
}
