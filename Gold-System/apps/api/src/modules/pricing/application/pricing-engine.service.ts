import { Inject, Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { CustomerType } from '@gold/shared-types';
import {
  PRICE_PROVIDER_TOKEN,
  PRICE_NORMALIZER_TOKEN,
  PriceProviderPort,
  PriceNormalizerPort,
} from '../domain/ports/price-provider.port';
import { PriceSnapshotRepository } from '../infrastructure/repositories/price-snapshot.repository';
import { PriceAdjustmentRepository } from '../infrastructure/repositories/price-adjustment.repository';
import { PricingRuleRepository } from '../infrastructure/repositories/pricing-rule.repository';
import { PriceSourceRepository } from '../infrastructure/repositories/price-source.repository';
import {
  PricingCalculationRepository,
  PricingCalculationRecord,
} from '../infrastructure/repositories/pricing-calculation.repository';
import { PriceSnapshotEntity } from '../domain/entities/price-snapshot.entity';
import { PriceAdjustmentEntity } from '../domain/entities/price-adjustment.entity';
import { PricingRuleEntity } from '../domain/entities/pricing-rule.entity';
import {
  StalePriceError,
  NoPriceAvailableError,
  InvalidWeightError,
  InvalidPurityError,
} from '../domain/exceptions/pricing.exceptions';
import { ConfigService } from '@nestjs/config';

// ─── Input / Output types ─────────────────────────────────────────────────────

export interface PricingEngineInput {
  /** Weight in grams — must be positive */
  weightGrams: Decimal;
  /**
   * Purity ratio (0, 1] — e.g. 0.750 for 18K gold.
   * Stored for reproducibility. Purity CONVERSION is DEFERRED (§1.5/§13.1).
   */
  purityRatio: Decimal;
  /** Customer type for group rule selection (Step 5) */
  customerType?: CustomerType;
  /**
   * Specific snapshot ID to use.
   * If null, the engine fetches the latest valid snapshot.
   */
  priceSnapshotId?: string;
  /**
   * Specific global adjustment ID to use.
   * If null, the engine finds the currently active global adjustment.
   */
  globalAdjustmentId?: string;
  /**
   * Specific pricing rule ID to use.
   * If null, the engine finds the rule for the given customer type.
   */
  pricingRuleId?: string;
  /**
   * Order-level discount amount (Rial).
   * Applied at Step 8 if provided and no rule-based discount exists.
   * If both exist, the larger discount applies (documented decision absent —
   * using order-level discount as override when provided).
   */
  orderLevelDiscountAmount?: Decimal;
  /** Context for the calculation (stored in PricingCalculation for traceability) */
  referenceType?: string;
  referenceId?: string;
}

export interface PricingEngineResult {
  calculationId: string;

  // ── Pipeline step results ──────────────────────────────────
  /** Step 1: normalized price per gram from snapshot */
  step1BasePrice: Decimal;
  /** Step 2: after global seller adjustment (+/- % or fixed) */
  step2AfterGlobalAdj: Decimal;
  /** Step 3: purity conversion — always DEFERRED in MVP (§1.5/§13.1) */
  step3PurityConvApplied: false;
  /** Step 4: total for given weight (Step 2 × weightGrams) */
  step4AfterWeight: Decimal;
  /** Step 5: after customer group rule (+/- %) */
  step5AfterGroupRule: Decimal;
  /** Wage amount (§1.6 — defaults to 0 for molten gold) */
  wageAmount: Decimal;
  /**
   * Step 6: Profit — null = BLOCKED on §13.2.
   * Profit base is undefined — cannot compute without resolution.
   * docs/21-business-decisions.md §13.2
   */
  profitAmount: null;
  /**
   * Step 7: Tax — null = BLOCKED on §13.3.
   * Tax rate and base are undefined — cannot compute without resolution.
   * docs/21-business-decisions.md §13.3
   */
  taxAmount: null;
  /** Step 8: Discount applied (§1.3 — applied after tax position) */
  discountAmount: Decimal;
  /** Subtotal before rounding */
  priceBeforeRounding: Decimal;
  /** Rounding delta (Step 9 — §1.7) */
  roundingAmount: Decimal;
  /**
   * Step 10: Final price.
   * ⚠️ Does NOT include profit or tax (both BLOCKED).
   * This price is incomplete until §13.2 and §13.3 are resolved.
   */
  finalPrice: Decimal;

  // ── Completeness ──────────────────────────────────────────────
  /**
   * false — always false until §13.2 and §13.3 are resolved.
   * The finalPrice excludes profit and tax when false.
   */
  isComplete: false;
  /**
   * Which pipeline steps are blocked and why.
   * Used to communicate to callers which decisions are pending.
   */
  blockedSteps: string[];

  // ── References ────────────────────────────────────────────────
  snapshotId: string;
  globalAdjId: string | null;
  pricingRuleId: string | null;
}

// ─── PricingEngine ───────────────────────────────────────────────────────────

@Injectable()
export class PricingEngineService {
  private readonly logger = new Logger(PricingEngineService.name);

  /** Price snapshot TTL in seconds — configurable via PRICE_SNAPSHOT_TTL_SECONDS */
  private readonly snapshotTtlSeconds: number;

  constructor(
    @Inject(PRICE_PROVIDER_TOKEN)
    private readonly provider: PriceProviderPort,
    @Inject(PRICE_NORMALIZER_TOKEN)
    private readonly normalizer: PriceNormalizerPort,
    private readonly snapshotRepo: PriceSnapshotRepository,
    private readonly adjRepo: PriceAdjustmentRepository,
    private readonly ruleRepo: PricingRuleRepository,
    private readonly sourceRepo: PriceSourceRepository,
    private readonly calcRepo: PricingCalculationRepository,
    private readonly config: ConfigService,
  ) {
    this.snapshotTtlSeconds = this.config.get<number>(
      'PRICE_SNAPSHOT_TTL_SECONDS',
      300, // 5 minutes default
    );
  }

  /** Lifetime enforced by the staleness check. Not a quotation expiry. */
  getSnapshotTtlSeconds(): number {
    return this.snapshotTtlSeconds;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // fetchAndSnapshot — Pull price from provider and store a snapshot
  // Called by the price polling scheduler (not yet built) or on-demand
  // ─────────────────────────────────────────────────────────────────────────
  async fetchAndSnapshot(): Promise<PriceSnapshotEntity> {
    this.logger.log(`Fetching price from provider: ${this.provider.providerName}`);

    // Ensure price source record exists
    const source = await this.sourceRepo.upsert({
      name: this.provider.providerName,
      providerType: 'MOCK', // real providers override this via config
    });

    // Fetch raw price from external provider
    const raw = await this.provider.getLatestPrice();

    // Normalize to canonical unit (IRR/gram — §1.5)
    const normalizedValue = this.normalizer.normalize(raw);

    // Store snapshot (immutable)
    const snapshot = await this.snapshotRepo.create({
      sourceId: source.id,
      rawValue: raw.rawValue,
      normalizedValue,
      unit: raw.unit,
      currency: raw.currency,
      purityReference: raw.purityReference,
      externalRef: raw.externalRef,
      metadata: raw.metadata,
      capturedAt: raw.capturedAt,
    });

    // Mark previous snapshots from this source as STALE
    await this.snapshotRepo.markPreviousAsStale(source.id, snapshot.id);

    this.logger.log(
      `Price snapshot created: ${snapshot.id} — ${normalizedValue.toFixed(0)} ${raw.unit}`,
    );

    return snapshot;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // calculate — Execute the pricing pipeline
  //
  // Pipeline (docs/21-business-decisions.md §1.2):
  //   Step 1:  Base Price (normalized snapshot)
  //   Step 2:  Global Seller Adjustment
  //   Step 3:  Purity Conversion — DEFERRED (§1.5/§13.1)
  //   Step 4:  Weight Calculation (price/gram × grams)
  //   Step 5:  Customer Group Rule (+/- % per CustomerType)
  //   [Wage]:  configurable; 0 for molten gold (§1.6)
  //   Step 6:  Profit — BLOCKED (§13.2 — base unknown)
  //   Step 7:  Tax — BLOCKED (§13.3 — rate + base unknown)
  //   Step 8:  Discount (after tax position — §1.3)
  //   Step 9:  Rounding (§1.7)
  //   Step 10: Final Price
  // ─────────────────────────────────────────────────────────────────────────
  async calculate(input: PricingEngineInput): Promise<PricingEngineResult> {
    // ── Input validation ───────────────────────────────────────
    this.validateWeight(input.weightGrams);
    this.validatePurity(input.purityRatio);

    // ── Step 1: Resolve price snapshot ────────────────────────
    let snapshot: PriceSnapshotEntity;
    if (input.priceSnapshotId) {
      const found = await this.snapshotRepo.findById(input.priceSnapshotId);
      if (!found) {
        throw new NoPriceAvailableError();
      }
      snapshot = found;
    } else {
      const latest = await this.snapshotRepo.findLatestValid();
      if (!latest) {
        throw new NoPriceAvailableError();
      }
      snapshot = latest;
    }

    // Staleness check (docs/12-pricing-engine.md)
    if (!snapshot.isWithinTtl(this.snapshotTtlSeconds)) {
      const ageSeconds = Math.floor((Date.now() - snapshot.capturedAt.getTime()) / 1000);
      throw new StalePriceError(snapshot.id, ageSeconds, this.snapshotTtlSeconds);
    }

    if (!snapshot.isValid()) {
      throw new StalePriceError(snapshot.id, 0, 0);
    }

    const step1BasePrice = snapshot.normalizedValue;

    // ── Step 2: Global seller adjustment ──────────────────────
    let globalAdj: PriceAdjustmentEntity | null = null;
    let step2AfterGlobalAdj = step1BasePrice;

    if (input.globalAdjustmentId) {
      globalAdj = await this.adjRepo.findById(input.globalAdjustmentId);
    } else {
      globalAdj = await this.adjRepo.findActiveGlobal();
    }

    if (globalAdj) {
      step2AfterGlobalAdj = globalAdj.apply(step1BasePrice);
      this.logger.debug(
        `Step 2 — Global adj [${globalAdj.id}]: ${step1BasePrice.toFixed(2)} → ${step2AfterGlobalAdj.toFixed(2)}`,
      );
    }

    // ── Step 3: Purity conversion — DEFERRED ──────────────────
    // §1.5/§13.1: Purity conversion requires knowing:
    //   - The API's reference purity (unknown until §13.1 resolved)
    //   - The purity conversion formula (unknown until §13.1 resolved)
    // The normalizedValue is used directly as price per gram.
    // purityRatio is stored for when Step 3 is implemented.
    const step3PricePerGram = step2AfterGlobalAdj; // passthrough

    // ── Step 4: Weight calculation ────────────────────────────
    const step4AfterWeight = step3PricePerGram.times(input.weightGrams);
    this.logger.debug(
      `Step 4 — Weight: ${step3PricePerGram.toFixed(2)} × ${input.weightGrams.toFixed(6)}g = ${step4AfterWeight.toFixed(2)}`,
    );

    // ── Step 5: Customer group rule ───────────────────────────
    let pricingRule: PricingRuleEntity | null = null;
    let step5AfterGroupRule = step4AfterWeight;

    if (input.pricingRuleId) {
      pricingRule = await this.ruleRepo.findById(input.pricingRuleId);
    } else if (input.customerType) {
      pricingRule = await this.ruleRepo.findActiveForType(input.customerType);
    }

    if (pricingRule) {
      step5AfterGroupRule = pricingRule.applyGroupAdj(step4AfterWeight);
      this.logger.debug(
        `Step 5 — Group rule [${pricingRule.id}]: ${step4AfterWeight.toFixed(2)} → ${step5AfterGroupRule.toFixed(2)}`,
      );
    }

    // ── Wage (§1.6) ───────────────────────────────────────────
    const wageAmount = pricingRule ? pricingRule.computeWage(step5AfterGroupRule) : new Decimal(0);

    // ── Step 6: Profit — BLOCKED on §13.2 ────────────────────
    // CANNOT COMPUTE: the base for profit % is not defined.
    // docs/21-business-decisions.md §13.2: Open question —
    //   Is profit % applied to (a) base price, (b) base + adj,
    //   (c) total after weight, or (d) some other base?
    // profitAmount = null (included in return object directly)

    // ── Step 7: Tax — BLOCKED on §13.3 ───────────────────────
    // CANNOT COMPUTE: both the tax rate and taxable base are undefined.
    // docs/21-business-decisions.md §13.3: Open question —
    //   What percentage? What is the taxable base?
    // taxAmount = null (included in return object directly)

    const blockedSteps: string[] = [
      'PROFIT (Step 6): blocked on §13.2 — profit calculation base undefined',
      'TAX (Step 7): blocked on §13.3 — tax rate and taxable base undefined',
    ];

    // ── Step 8: Discount (§1.3 — applied after tax position) ─
    // Since tax is BLOCKED, discount is applied to (Step 5 + Wage) subtotal.
    // The discount position in pipeline is correct; the base is reduced
    // only because Steps 6 and 7 could not be computed.
    let discountAmount = new Decimal(0);
    const subtotalBeforeDiscount = step5AfterGroupRule.plus(wageAmount);

    if (input.orderLevelDiscountAmount && input.orderLevelDiscountAmount.gt(0)) {
      discountAmount = input.orderLevelDiscountAmount;
    } else if (pricingRule) {
      discountAmount = pricingRule.computeDiscount(subtotalBeforeDiscount);
    }

    // ── Step 9: Rounding (§1.7) ───────────────────────────────
    const priceBeforeRounding = subtotalBeforeDiscount.minus(discountAmount);

    let roundingAmount = new Decimal(0);
    let finalPrice = priceBeforeRounding;

    if (pricingRule) {
      const { rounded, delta } = pricingRule.applyRounding(priceBeforeRounding);
      finalPrice = rounded;
      roundingAmount = delta;
    }

    this.logger.debug(
      `Step 10 — Final: ${finalPrice.toFixed(2)} (incomplete — profit + tax blocked)`,
    );

    // ── Persist PricingCalculation (immutable snapshot) ───────
    const calculationId = uuidv4();
    const calcRecord: PricingCalculationRecord = {
      id: calculationId,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      priceSnapshotId: snapshot.id,
      globalAdjId: globalAdj?.id ?? null,
      pricingRuleId: pricingRule?.id ?? null,
      weightGrams: input.weightGrams,
      purityRatio: input.purityRatio,
      customerType: input.customerType ?? null,
      inputDiscountAmount: input.orderLevelDiscountAmount ?? new Decimal(0),
      step1BasePrice,
      step2AfterGlobalAdj,
      step3PurityConvApplied: false,
      step4AfterWeight,
      step5AfterGroupRule,
      wageAmount,
      profitAmount: null,
      taxAmount: null,
      discountAmount,
      priceBeforeRounding,
      roundingAmount,
      finalPrice,
      isComplete: false, // always false until §13.2 and §13.3 resolved
      blockedSteps,
      calculatedAt: new Date(),
      calculationVersion: '1',
    };

    await this.calcRepo.create(calcRecord);

    return {
      calculationId,
      step1BasePrice,
      step2AfterGlobalAdj,
      step3PurityConvApplied: false as const,
      step4AfterWeight,
      step5AfterGroupRule,
      wageAmount,
      // null: BLOCKED on §13.2 — profit base undefined
      profitAmount: null as null,
      // null: BLOCKED on §13.3 — tax rate and base undefined
      taxAmount: null as null,
      discountAmount,
      priceBeforeRounding,
      roundingAmount,
      finalPrice,
      isComplete: false as const,
      blockedSteps,
      snapshotId: snapshot.id,
      globalAdjId: globalAdj?.id ?? null,
      pricingRuleId: pricingRule?.id ?? null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Input validation helpers
  // ─────────────────────────────────────────────────────────────────────────

  private validateWeight(weight: Decimal): void {
    if (!weight.isFinite() || weight.lte(0)) {
      throw new InvalidWeightError(weight.toString());
    }
  }

  private validatePurity(purity: Decimal): void {
    if (!purity.isFinite() || purity.lte(0) || purity.gt(1)) {
      throw new InvalidPurityError(purity.toString());
    }
  }
}
