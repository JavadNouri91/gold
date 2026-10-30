import Decimal from 'decimal.js';
import {
  CustomerType,
  FeeCalculationBase,
  FeeChargeCode,
  FeeChargeSide,
  FeeMode,
} from '@gold/shared-types';

import { FeePolicyEntity } from '../pricing/domain/entities/fee-policy.entity';
import { PriceSnapshotEntity } from '../pricing/domain/entities/price-snapshot.entity';
import { PickupFeeService } from './application/pickup-fee.service';
import { PickupPriceUnavailableException } from './domain/exceptions/pickup.exceptions';

function makePolicy(overrides: Partial<ConstructorParameters<typeof FeePolicyEntity>[0]> = {}): FeePolicyEntity {
  return new FeePolicyEntity({
    id: 'pol-1',
    customerType: null,
    side: FeeChargeSide.PICKUP,
    code: FeeChargeCode.PICKUP_CONVERSION_FEE,
    labelFa: 'کارمزد تبدیل به فیزیکی',
    mode: FeeMode.NONE,
    value: new Decimal('0'),
    calculationBase: null,
    enabled: true,
    priority: 1,
    activeFrom: new Date('2026-01-01T00:00:00.000Z'),
    activeTo: null,
    status: 'ACTIVE',
    ...overrides,
  });
}

function makeSnapshot(normalizedValue: string, id = 'snap-1'): PriceSnapshotEntity {
  return new PriceSnapshotEntity({
    id,
    sourceId: 'src-1',
    rawValue: new Decimal(normalizedValue),
    normalizedValue: new Decimal(normalizedValue),
    unit: 'RIAL_PER_GRAM',
    currency: 'IRR',
    purityReference: '750',
    externalRef: null,
    metadata: null,
    capturedAt: new Date('2026-10-27T10:00:00.000Z'),
    validityStatus: 'VALID',
    createdAt: new Date('2026-10-27T10:00:00.000Z'),
  });
}

function buildService() {
  const feeRepo = { findActiveForType: jest.fn().mockResolvedValue(null) };
  const pricing = { getCurrentPrice: jest.fn() };
  const snapshotRepo = { findById: jest.fn() };
  const service = new PickupFeeService(
    feeRepo as never,
    pricing as never,
    snapshotRepo as never,
  );
  return { service, feeRepo, pricing, snapshotRepo };
}

describe('PickupFeeService.compute', () => {
  it('returns NONE with zero amount when no policy exists', async () => {
    const { service, feeRepo } = buildService();
    feeRepo.findActiveForType.mockResolvedValue(null);

    const result = await service.compute(CustomerType.HOUSEHOLD, new Decimal('50'));

    expect(result.mode).toBe(FeeMode.NONE);
    expect(result.amountRial.toFixed(2)).toBe('0.00');
    expect(result.goldPricePerGramRial).toBeNull();
    expect(result.priceSnapshotId).toBeNull();
    expect(feeRepo.findActiveForType).toHaveBeenCalledWith(
      CustomerType.HOUSEHOLD,
      FeeChargeSide.PICKUP,
      FeeChargeCode.PICKUP_CONVERSION_FEE,
    );
  });

  it('computes a FIXED fee independent of gold price', async () => {
    const { service, feeRepo, pricing } = buildService();
    feeRepo.findActiveForType.mockResolvedValue(
      makePolicy({ mode: FeeMode.FIXED, value: new Decimal('50') }),
    );

    const result = await service.compute(null, new Decimal('100'));

    expect(result.mode).toBe(FeeMode.FIXED);
    expect(result.amountRial.toFixed(2)).toBe('50.00');
    expect(result.baseAmountRial.toFixed(2)).toBe('0.00');
    expect(result.goldPricePerGramRial).toBeNull();
    expect(pricing.getCurrentPrice).not.toHaveBeenCalled();
  });

  it('computes a PERCENTAGE fee from the per-gram gold price', async () => {
    const { service, feeRepo, pricing } = buildService();
    feeRepo.findActiveForType.mockResolvedValue(
      makePolicy({
        mode: FeeMode.PERCENTAGE,
        value: new Decimal('2'),
        calculationBase: FeeCalculationBase.PICKUP_GOLD_VALUE,
      }),
    );
    pricing.getCurrentPrice.mockResolvedValue({
      snapshotId: 'snap-1',
      normalizedValue: '1000000.00',
    });

    const result = await service.compute(null, new Decimal('50'));

    expect(result.goldPricePerGramRial?.toFixed(2)).toBe('1000000.00');
    expect(result.baseAmountRial.toFixed(2)).toBe('50000000.00');
    expect(result.amountRial.toFixed(2)).toBe('1000000.00');
    expect(result.priceSnapshotId).toBe('snap-1');
  });

  it('rounds the percentage amount half-up to 2 decimals', async () => {
    const { service, feeRepo, pricing } = buildService();
    pricing.getCurrentPrice.mockResolvedValue({
      snapshotId: 'snap-1',
      normalizedValue: '1000000.00',
    });

    // 1,000,000 * 1 * 0.0005555 / 100 = 5.555 → half-up rounds to 5.56
    feeRepo.findActiveForType.mockResolvedValue(
      makePolicy({ mode: FeeMode.PERCENTAGE, value: new Decimal('0.0005555') }),
    );
    const up = await service.compute(null, new Decimal('1'));
    expect(up.amountRial.toFixed(2)).toBe('5.56');

    // 1,000,000 * 1 * 0.0005554 / 100 = 5.554 → rounds down to 5.55
    feeRepo.findActiveForType.mockResolvedValue(
      makePolicy({ mode: FeeMode.PERCENTAGE, value: new Decimal('0.0005554') }),
    );
    const down = await service.compute(null, new Decimal('1'));
    expect(down.amountRial.toFixed(2)).toBe('5.55');
  });

  it('uses the provided priceSnapshotId and returns it back', async () => {
    const { service, feeRepo, snapshotRepo, pricing } = buildService();
    feeRepo.findActiveForType.mockResolvedValue(
      makePolicy({ mode: FeeMode.PERCENTAGE, value: new Decimal('1') }),
    );
    snapshotRepo.findById.mockResolvedValue(makeSnapshot('900000.00', 'snap-9'));

    const result = await service.compute(null, new Decimal('10'), 'snap-9');

    expect(snapshotRepo.findById).toHaveBeenCalledWith('snap-9');
    expect(pricing.getCurrentPrice).not.toHaveBeenCalled();
    expect(result.goldPricePerGramRial?.toFixed(2)).toBe('900000.00');
    expect(result.priceSnapshotId).toBe('snap-9');
  });

  it('throws PickupPriceUnavailableException for an invalid snapshot', async () => {
    const { service, feeRepo, snapshotRepo } = buildService();
    feeRepo.findActiveForType.mockResolvedValue(
      makePolicy({ mode: FeeMode.PERCENTAGE, value: new Decimal('1') }),
    );
    snapshotRepo.findById.mockResolvedValue(null);

    await expect(service.compute(null, new Decimal('10'), 'missing')).rejects.toBeInstanceOf(
      PickupPriceUnavailableException,
    );
  });

  it('does not resolve a price for a disabled policy', async () => {
    const { service, feeRepo, pricing } = buildService();
    feeRepo.findActiveForType.mockResolvedValue(
      makePolicy({ mode: FeeMode.PERCENTAGE, value: new Decimal('2'), enabled: false }),
    );

    const result = await service.compute(null, new Decimal('10'));

    expect(result.mode).toBe(FeeMode.PERCENTAGE);
    expect(result.amountRial.toFixed(2)).toBe('0.00');
    expect(pricing.getCurrentPrice).not.toHaveBeenCalled();
  });
});
