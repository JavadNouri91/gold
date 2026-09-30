/**
 * PricingEngine Unit Tests
 *
 * Tests for: docs/21-business-decisions.md §1.2 pipeline
 *
 * IMPLEMENTED and TESTED:
 *   Step 1: Base price from snapshot
 *   Step 2: Global seller adjustment (% and fixed, increase and decrease)
 *   Step 3: Purity conversion — DEFERRED passthrough
 *   Step 4: Weight calculation (price/gram × grams)
 *   Step 5: Customer group rule (% increase/decrease)
 *   Wage: configurable (§1.6 — 0 for molten gold default)
 *   Step 8: Discount (§1.3 — applied after tax position)
 *   Step 9: Rounding (§1.7 — ROUND_UP / ROUND_DOWN / ROUND_NEAREST)
 *
 * BLOCKED (not tested with formula — no formula to test):
 *   Step 6: Profit — §13.2 OPEN (profit base undefined)
 *   Step 7: Tax — §13.3 OPEN (rate and base undefined)
 *
 * Historical immutability: verified that the calculation record is persisted.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PricingEngineService } from './application/pricing-engine.service';
import { PRICE_PROVIDER_TOKEN, PRICE_NORMALIZER_TOKEN } from './domain/ports/price-provider.port';
import { PriceSnapshotRepository } from './infrastructure/repositories/price-snapshot.repository';
import { PriceAdjustmentRepository } from './infrastructure/repositories/price-adjustment.repository';
import { PricingRuleRepository } from './infrastructure/repositories/pricing-rule.repository';
import { PriceSourceRepository } from './infrastructure/repositories/price-source.repository';
import { PricingCalculationRepository } from './infrastructure/repositories/pricing-calculation.repository';
import { PriceSnapshotEntity } from './domain/entities/price-snapshot.entity';
import { PriceAdjustmentEntity } from './domain/entities/price-adjustment.entity';
import { PricingRuleEntity } from './domain/entities/pricing-rule.entity';
import { AdjustmentMode, AdjustmentDirection, CustomerType } from '@gold/shared-types';
import {
  StalePriceError,
  NoPriceAvailableError,
  InvalidWeightError,
  InvalidPurityError,
} from './domain/exceptions/pricing.exceptions';
import Decimal from 'decimal.js';

// ─── Helper factories ─────────────────────────────────────────────────────────

function makeSnapshot(
  overrides: Partial<{
    id: string;
    normalizedValue: Decimal;
    capturedAt: Date;
    validityStatus: 'VALID' | 'STALE' | 'INVALID';
  }> = {},
): PriceSnapshotEntity {
  return new PriceSnapshotEntity({
    id: overrides.id ?? 'snap-1',
    sourceId: 'source-1',
    rawValue: overrides.normalizedValue ?? new Decimal('70000000'),
    normalizedValue: overrides.normalizedValue ?? new Decimal('70000000'),
    unit: 'IRR_PER_GRAM',
    currency: 'IRR',
    purityReference: 'MOCK',
    externalRef: null,
    metadata: null,
    capturedAt: overrides.capturedAt ?? new Date(),
    validityStatus: overrides.validityStatus ?? 'VALID',
    createdAt: new Date(),
  });
}

function makeAdjustment(params: {
  mode: AdjustmentMode;
  direction: AdjustmentDirection;
  value: string;
}): PriceAdjustmentEntity {
  return new PriceAdjustmentEntity({
    id: 'adj-1',
    name: 'Test Adj',
    mode: params.mode,
    direction: params.direction,
    value: new Decimal(params.value),
    effectiveFrom: new Date('2020-01-01'),
    effectiveTo: null,
    status: 'ACTIVE',
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeRule(
  overrides: Partial<{
    groupAdjMode: 'NONE' | 'PERCENTAGE';
    groupAdjValue: string;
    groupAdjDirection: AdjustmentDirection;
    wageMode: 'NONE' | 'FIXED' | 'PERCENTAGE';
    wageValue: string;
    discountMode: 'NONE' | 'FIXED' | 'PERCENTAGE';
    discountValue: string;
    roundingMethod: 'NONE' | 'ROUND_UP' | 'ROUND_DOWN' | 'ROUND_NEAREST';
    roundingPrecision: string;
    customerType: CustomerType | null;
  }> = {},
): PricingRuleEntity {
  return new PricingRuleEntity({
    id: 'rule-1',
    name: 'Test Rule',
    customerType: overrides.customerType ?? CustomerType.HOUSEHOLD,
    groupAdjMode: overrides.groupAdjMode ?? 'NONE',
    groupAdjValue: new Decimal(overrides.groupAdjValue ?? '0'),
    groupAdjDirection: overrides.groupAdjDirection ?? AdjustmentDirection.INCREASE,
    wageMode: overrides.wageMode ?? 'NONE',
    wageValue: new Decimal(overrides.wageValue ?? '0'),
    discountMode: overrides.discountMode ?? 'NONE',
    discountValue: new Decimal(overrides.discountValue ?? '0'),
    roundingMethod: overrides.roundingMethod ?? 'NONE',
    roundingPrecision: new Decimal(overrides.roundingPrecision ?? '1'),
    priority: 0,
    activeFrom: new Date('2020-01-01'),
    activeTo: null,
    status: 'ACTIVE',
  });
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockProvider = {
  providerName: 'mock',
  getLatestPrice: jest.fn(),
  getMarketStatus: jest.fn(),
};

const mockNormalizer = {
  normalize: jest.fn((raw) => raw.rawValue),
  getCanonicalUnit: jest.fn(() => 'IRR_PER_GRAM'),
};

const mockSnapshotRepo = {
  findById: jest.fn(),
  findLatestValid: jest.fn(),
  findLatestValidBySource: jest.fn(),
  create: jest.fn(),
  markPreviousAsStale: jest.fn(),
  updateStatus: jest.fn(),
  list: jest.fn(),
};

const mockAdjRepo = {
  findById: jest.fn(),
  findActiveGlobal: jest.fn(),
  list: jest.fn(),
  create: jest.fn(),
};

const mockRuleRepo = {
  findById: jest.fn(),
  findActiveForType: jest.fn(),
  list: jest.fn(),
  create: jest.fn(),
};

const mockSourceRepo = {
  findByName: jest.fn(),
  findActive: jest.fn(),
  upsert: jest.fn(),
};

const mockCalcRepo = {
  findById: jest.fn(),
  findByReference: jest.fn(),
  create: jest.fn().mockImplementation(async (d) => d),
};

const mockConfig = {
  get: jest.fn((key: string, defaultVal?: unknown) => {
    if (key === 'PRICE_SNAPSHOT_TTL_SECONDS') return 300;
    if (key === 'MOCK_PRICE_PROVIDER_FAIL') return 'false';
    if (key === 'MOCK_PRICE_IRR_PER_GRAM') return '70000000';
    return defaultVal;
  }),
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('PricingEngineService', () => {
  let engine: PricingEngineService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCalcRepo.create.mockImplementation(async (d) => d);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingEngineService,
        { provide: PRICE_PROVIDER_TOKEN, useValue: mockProvider },
        { provide: PRICE_NORMALIZER_TOKEN, useValue: mockNormalizer },
        { provide: PriceSnapshotRepository, useValue: mockSnapshotRepo },
        { provide: PriceAdjustmentRepository, useValue: mockAdjRepo },
        { provide: PricingRuleRepository, useValue: mockRuleRepo },
        { provide: PriceSourceRepository, useValue: mockSourceRepo },
        { provide: PricingCalculationRepository, useValue: mockCalcRepo },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    engine = module.get<PricingEngineService>(PricingEngineService);
  });

  // ── Input validation ─────────────────────────────────────────────────────

  describe('input validation', () => {
    beforeEach(() => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(makeSnapshot());
      mockAdjRepo.findActiveGlobal.mockResolvedValue(null);
      mockRuleRepo.findActiveForType.mockResolvedValue(null);
    });

    it('throws InvalidWeightError for zero weight', async () => {
      await expect(
        engine.calculate({
          weightGrams: new Decimal(0),
          purityRatio: new Decimal('0.750'),
        }),
      ).rejects.toThrow(InvalidWeightError);
    });

    it('throws InvalidWeightError for negative weight', async () => {
      await expect(
        engine.calculate({
          weightGrams: new Decimal(-5),
          purityRatio: new Decimal('0.750'),
        }),
      ).rejects.toThrow(InvalidWeightError);
    });

    it('throws InvalidPurityError for purity > 1', async () => {
      await expect(
        engine.calculate({
          weightGrams: new Decimal(10),
          purityRatio: new Decimal('1.001'),
        }),
      ).rejects.toThrow(InvalidPurityError);
    });

    it('throws InvalidPurityError for purity = 0', async () => {
      await expect(
        engine.calculate({
          weightGrams: new Decimal(10),
          purityRatio: new Decimal(0),
        }),
      ).rejects.toThrow(InvalidPurityError);
    });

    it('accepts purity = 1 (pure gold)', async () => {
      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal(1),
      });
      expect(result.finalPrice.isFinite()).toBe(true);
    });
  });

  // ── Provider unavailable ─────────────────────────────────────────────────

  describe('provider unavailable', () => {
    it('throws NoPriceAvailableError when no valid snapshot exists', async () => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(null);
      await expect(
        engine.calculate({ weightGrams: new Decimal(10), purityRatio: new Decimal('0.750') }),
      ).rejects.toThrow(NoPriceAvailableError);
    });

    it('throws StalePriceError when snapshot is beyond TTL', async () => {
      const oldDate = new Date(Date.now() - 400_000); // 400s ago > 300s TTL
      mockSnapshotRepo.findLatestValid.mockResolvedValue(makeSnapshot({ capturedAt: oldDate }));
      await expect(
        engine.calculate({ weightGrams: new Decimal(10), purityRatio: new Decimal('0.750') }),
      ).rejects.toThrow(StalePriceError);
    });

    it('throws StalePriceError for STALE snapshot', async () => {
      mockSnapshotRepo.findById.mockResolvedValue(makeSnapshot({ validityStatus: 'STALE' }));
      await expect(
        engine.calculate({
          weightGrams: new Decimal(10),
          purityRatio: new Decimal('0.750'),
          priceSnapshotId: 'snap-1',
        }),
      ).rejects.toThrow(StalePriceError);
    });
  });

  // ── Step 1: Base price ───────────────────────────────────────────────────

  describe('Step 1 — Base price from snapshot', () => {
    it('uses normalizedValue from snapshot as base price', async () => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(
        makeSnapshot({ normalizedValue: new Decimal('70000000') }),
      );
      mockAdjRepo.findActiveGlobal.mockResolvedValue(null);
      mockRuleRepo.findActiveForType.mockResolvedValue(null);

      const result = await engine.calculate({
        weightGrams: new Decimal(1),
        purityRatio: new Decimal('0.750'),
      });

      // Without any adjustment or weight (1g): finalPrice ≈ basePrice
      expect(result.step1BasePrice.toFixed(0)).toBe('70000000');
    });
  });

  // ── Step 2: Global seller adjustment ────────────────────────────────────

  describe('Step 2 — Global seller adjustment', () => {
    beforeEach(() => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(
        makeSnapshot({ normalizedValue: new Decimal('70000000') }),
      );
      mockRuleRepo.findActiveForType.mockResolvedValue(null);
    });

    it('applies percentage INCREASE correctly', async () => {
      // +2% on 70,000,000 → 71,400,000
      mockAdjRepo.findActiveGlobal.mockResolvedValue(
        makeAdjustment({
          mode: AdjustmentMode.PERCENTAGE,
          direction: AdjustmentDirection.INCREASE,
          value: '2',
        }),
      );

      const result = await engine.calculate({
        weightGrams: new Decimal(1),
        purityRatio: new Decimal('0.750'),
      });

      expect(result.step2AfterGlobalAdj.toFixed(0)).toBe('71400000');
    });

    it('applies percentage DECREASE correctly', async () => {
      // -2% on 70,000,000 → 68,600,000
      mockAdjRepo.findActiveGlobal.mockResolvedValue(
        makeAdjustment({
          mode: AdjustmentMode.PERCENTAGE,
          direction: AdjustmentDirection.DECREASE,
          value: '2',
        }),
      );

      const result = await engine.calculate({
        weightGrams: new Decimal(1),
        purityRatio: new Decimal('0.750'),
      });

      expect(result.step2AfterGlobalAdj.toFixed(0)).toBe('68600000');
    });

    it('applies fixed INCREASE correctly', async () => {
      // +500,000 fixed on 70,000,000 → 70,500,000
      mockAdjRepo.findActiveGlobal.mockResolvedValue(
        makeAdjustment({
          mode: AdjustmentMode.FIXED,
          direction: AdjustmentDirection.INCREASE,
          value: '500000',
        }),
      );

      const result = await engine.calculate({
        weightGrams: new Decimal(1),
        purityRatio: new Decimal('0.750'),
      });

      expect(result.step2AfterGlobalAdj.toFixed(0)).toBe('70500000');
    });

    it('applies fixed DECREASE correctly', async () => {
      // -500,000 fixed on 70,000,000 → 69,500,000
      mockAdjRepo.findActiveGlobal.mockResolvedValue(
        makeAdjustment({
          mode: AdjustmentMode.FIXED,
          direction: AdjustmentDirection.DECREASE,
          value: '500000',
        }),
      );

      const result = await engine.calculate({
        weightGrams: new Decimal(1),
        purityRatio: new Decimal('0.750'),
      });

      expect(result.step2AfterGlobalAdj.toFixed(0)).toBe('69500000');
    });

    it('skips Step 2 when no active adjustment exists', async () => {
      mockAdjRepo.findActiveGlobal.mockResolvedValue(null);

      const result = await engine.calculate({
        weightGrams: new Decimal(1),
        purityRatio: new Decimal('0.750'),
      });

      expect(result.step2AfterGlobalAdj.toFixed(0)).toBe('70000000');
    });
  });

  // ── Step 3: Purity conversion — DEFERRED ────────────────────────────────

  describe('Step 3 — Purity conversion (DEFERRED)', () => {
    it('always returns step3PurityConvApplied = false', async () => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(makeSnapshot());
      mockAdjRepo.findActiveGlobal.mockResolvedValue(null);
      mockRuleRepo.findActiveForType.mockResolvedValue(null);

      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
      });

      // §1.5/§13.1: purity conversion is DEFERRED
      expect(result.step3PurityConvApplied).toBe(false);
    });

    it('does NOT modify price in Step 3 (passthrough)', async () => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(
        makeSnapshot({ normalizedValue: new Decimal('70000000') }),
      );
      mockAdjRepo.findActiveGlobal.mockResolvedValue(null);
      mockRuleRepo.findActiveForType.mockResolvedValue(null);

      const result = await engine.calculate({
        weightGrams: new Decimal(1),
        purityRatio: new Decimal('0.750'),
      });

      // step4 = step2 × weight: 70000000 × 1 = 70000000
      expect(result.step4AfterWeight.toFixed(0)).toBe('70000000');
    });
  });

  // ── Step 4: Weight calculation ───────────────────────────────────────────

  describe('Step 4 — Weight calculation (price/gram × grams)', () => {
    it('computes total for 10 grams at 70,000,000/gram correctly', async () => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(
        makeSnapshot({ normalizedValue: new Decimal('70000000') }),
      );
      mockAdjRepo.findActiveGlobal.mockResolvedValue(null);
      mockRuleRepo.findActiveForType.mockResolvedValue(null);

      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
      });

      // 70,000,000 × 10 = 700,000,000
      expect(result.step4AfterWeight.toFixed(0)).toBe('700000000');
    });

    it('computes total for fractional grams correctly', async () => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(
        makeSnapshot({ normalizedValue: new Decimal('70000000') }),
      );
      mockAdjRepo.findActiveGlobal.mockResolvedValue(null);
      mockRuleRepo.findActiveForType.mockResolvedValue(null);

      const result = await engine.calculate({
        weightGrams: new Decimal('0.5'),
        purityRatio: new Decimal('0.750'),
      });

      // 70,000,000 × 0.5 = 35,000,000
      expect(result.step4AfterWeight.toFixed(0)).toBe('35000000');
    });
  });

  // ── Step 5: Customer group rule ──────────────────────────────────────────

  describe('Step 5 — Customer group rule', () => {
    beforeEach(() => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(
        makeSnapshot({ normalizedValue: new Decimal('70000000') }),
      );
      mockAdjRepo.findActiveGlobal.mockResolvedValue(null);
    });

    it('applies group INCREASE % to weight subtotal', async () => {
      // 70,000,000 × 10g = 700,000,000 → +2% = 714,000,000
      mockRuleRepo.findActiveForType.mockResolvedValue(
        makeRule({
          groupAdjMode: 'PERCENTAGE',
          groupAdjValue: '2',
          groupAdjDirection: AdjustmentDirection.INCREASE,
        }),
      );

      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
        customerType: CustomerType.HOUSEHOLD,
      });

      expect(result.step5AfterGroupRule.toFixed(0)).toBe('714000000');
    });

    it('applies group DECREASE % to weight subtotal', async () => {
      // 700,000,000 → -5% = 665,000,000
      mockRuleRepo.findActiveForType.mockResolvedValue(
        makeRule({
          groupAdjMode: 'PERCENTAGE',
          groupAdjValue: '5',
          groupAdjDirection: AdjustmentDirection.DECREASE,
        }),
      );

      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
        customerType: CustomerType.VIP,
      });

      expect(result.step5AfterGroupRule.toFixed(0)).toBe('665000000');
    });

    it('step5 equals step4 when no group rule exists', async () => {
      mockRuleRepo.findActiveForType.mockResolvedValue(null);

      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
        customerType: CustomerType.HOUSEHOLD,
      });

      expect(result.step5AfterGroupRule.toFixed(0)).toBe(result.step4AfterWeight.toFixed(0));
    });
  });

  // ── Wage (§1.6) ──────────────────────────────────────────────────────────

  describe('Wage (§1.6)', () => {
    beforeEach(() => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(
        makeSnapshot({ normalizedValue: new Decimal('70000000') }),
      );
      mockAdjRepo.findActiveGlobal.mockResolvedValue(null);
    });

    it('wage = 0 when wageMode is NONE (molten gold default)', async () => {
      mockRuleRepo.findActiveForType.mockResolvedValue(makeRule({ wageMode: 'NONE' }));

      const result = await engine.calculate({
        weightGrams: new Decimal(1),
        purityRatio: new Decimal('0.750'),
        customerType: CustomerType.HOUSEHOLD,
      });

      expect(result.wageAmount.toFixed(0)).toBe('0');
    });

    it('computes fixed wage correctly', async () => {
      // Fixed wage: 1,000,000 per calculation
      mockRuleRepo.findActiveForType.mockResolvedValue(
        makeRule({ wageMode: 'FIXED', wageValue: '1000000' }),
      );

      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
        customerType: CustomerType.PARTNER,
      });

      expect(result.wageAmount.toFixed(0)).toBe('1000000');
    });

    it('computes percentage wage correctly', async () => {
      // 700,000,000 × 1% = 7,000,000
      mockRuleRepo.findActiveForType.mockResolvedValue(
        makeRule({ wageMode: 'PERCENTAGE', wageValue: '1' }),
      );

      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
        customerType: CustomerType.HOUSEHOLD,
      });

      expect(result.wageAmount.toFixed(0)).toBe('7000000');
    });
  });

  // ── Steps 6 & 7: BLOCKED steps ───────────────────────────────────────────

  describe('Steps 6 & 7 — BLOCKED (profit and tax)', () => {
    it('profitAmount is always null (§13.2 OPEN)', async () => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(makeSnapshot());
      mockAdjRepo.findActiveGlobal.mockResolvedValue(null);
      mockRuleRepo.findActiveForType.mockResolvedValue(null);

      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
      });

      // Must be null — profit base not defined
      expect(result.profitAmount).toBeNull();
    });

    it('taxAmount is always null (§13.3 OPEN)', async () => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(makeSnapshot());
      mockAdjRepo.findActiveGlobal.mockResolvedValue(null);
      mockRuleRepo.findActiveForType.mockResolvedValue(null);

      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
      });

      // Must be null — tax rate and base not defined
      expect(result.taxAmount).toBeNull();
    });

    it('isComplete is always false while profit and tax are blocked', async () => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(makeSnapshot());
      mockAdjRepo.findActiveGlobal.mockResolvedValue(null);
      mockRuleRepo.findActiveForType.mockResolvedValue(null);

      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
      });

      expect(result.isComplete).toBe(false);
    });

    it('blockedSteps contains both profit and tax reasons', async () => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(makeSnapshot());
      mockAdjRepo.findActiveGlobal.mockResolvedValue(null);
      mockRuleRepo.findActiveForType.mockResolvedValue(null);

      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
      });

      expect(result.blockedSteps.length).toBe(2);
      expect(result.blockedSteps[0]).toContain('§13.2');
      expect(result.blockedSteps[1]).toContain('§13.3');
    });
  });

  // ── Step 8: Discount (§1.3) ──────────────────────────────────────────────

  describe('Step 8 — Discount (§1.3 — applied after tax position)', () => {
    beforeEach(() => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(
        makeSnapshot({ normalizedValue: new Decimal('70000000') }),
      );
      mockAdjRepo.findActiveGlobal.mockResolvedValue(null);
    });

    it('applies rule-based FIXED discount', async () => {
      // 700,000,000 - 5,000,000 = 695,000,000
      mockRuleRepo.findActiveForType.mockResolvedValue(
        makeRule({ discountMode: 'FIXED', discountValue: '5000000' }),
      );

      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
        customerType: CustomerType.VIP,
      });

      expect(result.discountAmount.toFixed(0)).toBe('5000000');
      expect(result.priceBeforeRounding.toFixed(0)).toBe('695000000');
    });

    it('applies rule-based PERCENTAGE discount', async () => {
      // 700,000,000 × 1% = 7,000,000 discount → 693,000,000
      mockRuleRepo.findActiveForType.mockResolvedValue(
        makeRule({ discountMode: 'PERCENTAGE', discountValue: '1' }),
      );

      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
        customerType: CustomerType.HOUSEHOLD,
      });

      expect(result.discountAmount.toFixed(0)).toBe('7000000');
    });

    it('applies order-level discount when provided', async () => {
      mockRuleRepo.findActiveForType.mockResolvedValue(null);

      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
        orderLevelDiscountAmount: new Decimal('2000000'),
      });

      expect(result.discountAmount.toFixed(0)).toBe('2000000');
    });

    it('discount = 0 when neither rule nor order-level discount is set', async () => {
      mockRuleRepo.findActiveForType.mockResolvedValue(null);

      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
      });

      expect(result.discountAmount.toFixed(0)).toBe('0');
    });
  });

  // ── Step 9: Rounding (§1.7) ──────────────────────────────────────────────

  describe('Step 9 — Rounding (§1.7)', () => {
    beforeEach(() => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(
        makeSnapshot({ normalizedValue: new Decimal('70000000') }),
      );
      mockAdjRepo.findActiveGlobal.mockResolvedValue(null);
    });

    it('ROUND_UP to nearest 1,000', async () => {
      // 70,000,000 × 1.5g = 105,000,000 → already rounded
      // Use a price that needs rounding: 70,000,500 × 1g = 70,000,500 → ROUND_UP to 1000 → 70,001,000
      mockSnapshotRepo.findLatestValid.mockResolvedValue(
        makeSnapshot({ normalizedValue: new Decimal('70000500') }),
      );
      mockRuleRepo.findActiveForType.mockResolvedValue(
        makeRule({ roundingMethod: 'ROUND_UP', roundingPrecision: '1000' }),
      );

      const result = await engine.calculate({
        weightGrams: new Decimal(1),
        purityRatio: new Decimal('0.750'),
        customerType: CustomerType.HOUSEHOLD,
      });

      // 70,000,500 rounded UP to nearest 1,000 → 70,001,000
      expect(result.finalPrice.toFixed(0)).toBe('70001000');
    });

    it('ROUND_DOWN to nearest 1,000', async () => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(
        makeSnapshot({ normalizedValue: new Decimal('70000500') }),
      );
      mockRuleRepo.findActiveForType.mockResolvedValue(
        makeRule({ roundingMethod: 'ROUND_DOWN', roundingPrecision: '1000' }),
      );

      const result = await engine.calculate({
        weightGrams: new Decimal(1),
        purityRatio: new Decimal('0.750'),
        customerType: CustomerType.HOUSEHOLD,
      });

      // 70,000,500 rounded DOWN to nearest 1,000 → 70,000,000
      expect(result.finalPrice.toFixed(0)).toBe('70000000');
    });

    it('ROUND_NEAREST to nearest 1,000 (rounds up at 500)', async () => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(
        makeSnapshot({ normalizedValue: new Decimal('70000500') }),
      );
      mockRuleRepo.findActiveForType.mockResolvedValue(
        makeRule({ roundingMethod: 'ROUND_NEAREST', roundingPrecision: '1000' }),
      );

      const result = await engine.calculate({
        weightGrams: new Decimal(1),
        purityRatio: new Decimal('0.750'),
        customerType: CustomerType.HOUSEHOLD,
      });

      // 70,000,500 rounded nearest to 1,000 → 70,001,000 (rounds up at 500)
      expect(result.finalPrice.toFixed(0)).toBe('70001000');
    });

    it('NONE rounding = no change', async () => {
      mockRuleRepo.findActiveForType.mockResolvedValue(makeRule({ roundingMethod: 'NONE' }));

      const result = await engine.calculate({
        weightGrams: new Decimal(1),
        purityRatio: new Decimal('0.750'),
        customerType: CustomerType.HOUSEHOLD,
      });

      expect(result.roundingAmount.toFixed(0)).toBe('0');
    });
  });

  // ── Full pipeline end-to-end ─────────────────────────────────────────────

  describe('Full pipeline — end-to-end (Steps 1,2,4,5,8,9 implemented)', () => {
    it('computes correct final price through all implemented steps', async () => {
      /**
       * Inputs:
       *   Base price (Step 1):  70,000,000 IRR/gram
       *   Global adj (Step 2):  +2% → 71,400,000 IRR/gram
       *   Purity conv (Step 3): DEFERRED → passthrough
       *   Weight × price (Step 4): 71,400,000 × 10g = 714,000,000
       *   Group rule (Step 5):  -1% → 714,000,000 × 0.99 = 706,860,000
       *   Wage: NONE → 0
       *   Profit: null (BLOCKED §13.2)
       *   Tax: null (BLOCKED §13.3)
       *   Discount (Step 8): FIXED 1,000,000 → 705,860,000
       *   Rounding (Step 9): ROUND_DOWN to 1,000 → 705,860,000
       *   Final: 705,860,000
       */
      mockSnapshotRepo.findLatestValid.mockResolvedValue(
        makeSnapshot({ normalizedValue: new Decimal('70000000') }),
      );
      mockAdjRepo.findActiveGlobal.mockResolvedValue(
        makeAdjustment({
          mode: AdjustmentMode.PERCENTAGE,
          direction: AdjustmentDirection.INCREASE,
          value: '2',
        }),
      );
      mockRuleRepo.findActiveForType.mockResolvedValue(
        makeRule({
          groupAdjMode: 'PERCENTAGE',
          groupAdjValue: '1',
          groupAdjDirection: AdjustmentDirection.DECREASE,
          discountMode: 'FIXED',
          discountValue: '1000000',
          roundingMethod: 'ROUND_DOWN',
          roundingPrecision: '1000',
        }),
      );

      const result = await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
        customerType: CustomerType.HOUSEHOLD,
      });

      expect(result.step1BasePrice.toFixed(0)).toBe('70000000');
      expect(result.step2AfterGlobalAdj.toFixed(0)).toBe('71400000');
      expect(result.step3PurityConvApplied).toBe(false);
      expect(result.step4AfterWeight.toFixed(0)).toBe('714000000');
      expect(result.step5AfterGroupRule.toFixed(0)).toBe('706860000');
      expect(result.wageAmount.toFixed(0)).toBe('0');
      expect(result.profitAmount).toBeNull();
      expect(result.taxAmount).toBeNull();
      expect(result.discountAmount.toFixed(0)).toBe('1000000');
      expect(result.priceBeforeRounding.toFixed(0)).toBe('705860000');
      expect(result.finalPrice.toFixed(0)).toBe('705860000');
      expect(result.isComplete).toBe(false);
    });
  });

  // ── Historical immutability ──────────────────────────────────────────────

  describe('Historical immutability (§7)', () => {
    it('persists PricingCalculation to repository after each calculation', async () => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(makeSnapshot());
      mockAdjRepo.findActiveGlobal.mockResolvedValue(null);
      mockRuleRepo.findActiveForType.mockResolvedValue(null);

      await engine.calculate({
        weightGrams: new Decimal(10),
        purityRatio: new Decimal('0.750'),
        referenceType: 'MANUAL',
      });

      expect(mockCalcRepo.create).toHaveBeenCalledTimes(1);
      const savedCalc = mockCalcRepo.create.mock.calls[0][0];
      expect(savedCalc.step3PurityConvApplied).toBe(false);
      expect(savedCalc.profitAmount).toBeNull();
      expect(savedCalc.taxAmount).toBeNull();
      expect(savedCalc.isComplete).toBe(false);
      expect(savedCalc.blockedSteps).toHaveLength(2);
    });

    it('calculation record includes all pipeline inputs for reproducibility', async () => {
      mockSnapshotRepo.findLatestValid.mockResolvedValue(makeSnapshot({ id: 'snap-xyz' }));
      mockAdjRepo.findActiveGlobal.mockResolvedValue(
        makeAdjustment({
          mode: AdjustmentMode.PERCENTAGE,
          direction: AdjustmentDirection.INCREASE,
          value: '1',
        }),
      );
      mockRuleRepo.findActiveForType.mockResolvedValue(
        makeRule({ customerType: CustomerType.VIP }),
      );

      await engine.calculate({
        weightGrams: new Decimal('5.250'),
        purityRatio: new Decimal('0.999'),
        customerType: CustomerType.VIP,
      });

      const saved = mockCalcRepo.create.mock.calls[0][0];
      expect(saved.priceSnapshotId).toBe('snap-xyz');
      expect(saved.weightGrams.toFixed(3)).toBe('5.250');
      expect(saved.purityRatio.toFixed(3)).toBe('0.999');
      expect(saved.customerType).toBe(CustomerType.VIP);
      expect(saved.globalAdjId).toBe('adj-1');
      expect(saved.pricingRuleId).toBe('rule-1');
    });
  });

  // ── PricingRuleEntity domain methods ────────────────────────────────────

  describe('PricingRuleEntity domain methods', () => {
    it('applyGroupAdj PERCENTAGE +5% is exact', () => {
      const rule = makeRule({
        groupAdjMode: 'PERCENTAGE',
        groupAdjValue: '5',
        groupAdjDirection: AdjustmentDirection.INCREASE,
      });
      const base = new Decimal('100000000');
      const result = rule.applyGroupAdj(base);
      expect(result.toFixed(0)).toBe('105000000');
    });

    it('applyGroupAdj PERCENTAGE -5% is exact', () => {
      const rule = makeRule({
        groupAdjMode: 'PERCENTAGE',
        groupAdjValue: '5',
        groupAdjDirection: AdjustmentDirection.DECREASE,
      });
      const base = new Decimal('100000000');
      const result = rule.applyGroupAdj(base);
      expect(result.toFixed(0)).toBe('95000000');
    });

    it('applyGroupAdj NONE returns base unchanged', () => {
      const rule = makeRule({ groupAdjMode: 'NONE' });
      const base = new Decimal('100000000');
      expect(rule.applyGroupAdj(base).toFixed(0)).toBe('100000000');
    });

    it('applyRounding ROUND_UP precision 1000', () => {
      const rule = makeRule({ roundingMethod: 'ROUND_UP', roundingPrecision: '1000' });
      const { rounded } = rule.applyRounding(new Decimal('100500'));
      expect(rounded.toFixed(0)).toBe('101000');
    });

    it('applyRounding ROUND_DOWN precision 1000', () => {
      const rule = makeRule({ roundingMethod: 'ROUND_DOWN', roundingPrecision: '1000' });
      const { rounded } = rule.applyRounding(new Decimal('100999'));
      expect(rounded.toFixed(0)).toBe('100000');
    });

    it('applyRounding ROUND_NEAREST precision 1000 (below 500 → rounds down)', () => {
      const rule = makeRule({ roundingMethod: 'ROUND_NEAREST', roundingPrecision: '1000' });
      const { rounded } = rule.applyRounding(new Decimal('100499'));
      expect(rounded.toFixed(0)).toBe('100000');
    });

    it('applyRounding ROUND_NEAREST precision 1000 (at 500 → rounds up)', () => {
      const rule = makeRule({ roundingMethod: 'ROUND_NEAREST', roundingPrecision: '1000' });
      const { rounded } = rule.applyRounding(new Decimal('100500'));
      expect(rounded.toFixed(0)).toBe('101000');
    });
  });

  // ── PriceAdjustmentEntity.apply ──────────────────────────────────────────

  describe('PriceAdjustmentEntity.apply — BR-P04', () => {
    it('PERCENTAGE INCREASE: 2% of 70,000,000 = 71,400,000', () => {
      const adj = makeAdjustment({
        mode: AdjustmentMode.PERCENTAGE,
        direction: AdjustmentDirection.INCREASE,
        value: '2',
      });
      expect(adj.apply(new Decimal('70000000')).toFixed(0)).toBe('71400000');
    });

    it('PERCENTAGE DECREASE: 2% of 70,000,000 = 68,600,000', () => {
      const adj = makeAdjustment({
        mode: AdjustmentMode.PERCENTAGE,
        direction: AdjustmentDirection.DECREASE,
        value: '2',
      });
      expect(adj.apply(new Decimal('70000000')).toFixed(0)).toBe('68600000');
    });

    it('FIXED INCREASE: +500,000 = 70,500,000', () => {
      const adj = makeAdjustment({
        mode: AdjustmentMode.FIXED,
        direction: AdjustmentDirection.INCREASE,
        value: '500000',
      });
      expect(adj.apply(new Decimal('70000000')).toFixed(0)).toBe('70500000');
    });

    it('FIXED DECREASE: -500,000 = 69,500,000', () => {
      const adj = makeAdjustment({
        mode: AdjustmentMode.FIXED,
        direction: AdjustmentDirection.DECREASE,
        value: '500000',
      });
      expect(adj.apply(new Decimal('70000000')).toFixed(0)).toBe('69500000');
    });

    it('uses Decimal precision — no floating point errors', () => {
      // A known floating-point trap: 0.1 + 0.2 !== 0.3 in JS
      const adj = makeAdjustment({
        mode: AdjustmentMode.PERCENTAGE,
        direction: AdjustmentDirection.INCREASE,
        value: '0.1',
      });
      const result = adj.apply(new Decimal('300000000'));
      // 300,000,000 × 0.001 = 300,000 → 300,300,000
      expect(result.toFixed(2)).toBe('300300000.00');
    });
  });

  // ── MockPriceProvider ────────────────────────────────────────────────────

  describe('fetchAndSnapshot — provider abstraction', () => {
    it('calls provider, normalizes, stores snapshot, marks previous as stale', async () => {
      mockProvider.getLatestPrice.mockResolvedValue({
        rawValue: new Decimal('70000000'),
        unit: 'IRR_PER_GRAM',
        purityReference: 'MOCK',
        currency: 'IRR',
        capturedAt: new Date(),
        externalRef: 'mock-123',
        metadata: null,
      });
      mockSourceRepo.upsert.mockResolvedValue({ id: 'source-1', name: 'mock' });
      mockSnapshotRepo.create.mockResolvedValue(makeSnapshot({ id: 'snap-new' }));
      mockSnapshotRepo.markPreviousAsStale.mockResolvedValue(undefined);

      const snapshot = await engine.fetchAndSnapshot();

      expect(mockProvider.getLatestPrice).toHaveBeenCalled();
      expect(mockNormalizer.normalize).toHaveBeenCalled();
      expect(mockSnapshotRepo.create).toHaveBeenCalled();
      expect(mockSnapshotRepo.markPreviousAsStale).toHaveBeenCalledWith('source-1', 'snap-new');
      expect(snapshot.id).toBe('snap-new');
    });
  });
});
