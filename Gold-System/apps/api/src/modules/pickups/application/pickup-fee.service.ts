import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import {
  CustomerType,
  FeeCalculationBase,
  FeeChargeCode,
  FeeChargeSide,
  FeeMode,
} from '@gold/shared-types';

import { FeePolicyRepository } from '../../pricing/infrastructure/repositories/fee-policy.repository';
import { FeePolicyEntity } from '../../pricing/domain/entities/fee-policy.entity';
import { PricingService } from '../../pricing/application/pricing.service';
import { PriceSnapshotRepository } from '../../pricing/infrastructure/repositories/price-snapshot.repository';
import { PickupPriceUnavailableException } from '../domain/exceptions/pickup.exceptions';

/** Immutable result of computing the conversion fee for one pickup request. */
export interface PickupFeeComputation {
  policy: FeePolicyEntity | null;
  mode: FeeMode;
  rateValue: Decimal;
  calculationBase: FeeCalculationBase | null;
  baseAmountRial: Decimal;
  amountRial: Decimal;
  goldPricePerGramRial: Decimal | null;
  /** Snapshot id used to lock the price; `null` for FIXED/NONE fees. */
  priceSnapshotId: string | null;
}

/**
 * Calculates the melted → physical conversion fee for a pickup request.
 *
 * The fee is a per-customer-type policy (`FeeChargeSide.PICKUP`, code
 * `PICKUP_CONVERSION_FEE`) with a NONE / FIXED / PERCENTAGE mode. Percentage
 * fees are based on the gold value at request time (per-gram price × weight).
 */
@Injectable()
export class PickupFeeService {
  constructor(
    private readonly feeRepo: FeePolicyRepository,
    private readonly pricing: PricingService,
    private readonly snapshotRepo: PriceSnapshotRepository,
  ) {}

  async findPolicy(customerType: CustomerType | null | undefined): Promise<FeePolicyEntity | null> {
    return this.feeRepo.findActiveForType(
      customerType ?? null,
      FeeChargeSide.PICKUP,
      FeeChargeCode.PICKUP_CONVERSION_FEE,
    );
  }

  async compute(
    customerType: CustomerType | null | undefined,
    weightGrams: Decimal,
    priceSnapshotId?: string,
  ): Promise<PickupFeeComputation> {
    const policy = await this.findPolicy(customerType);
    const mode = policy?.mode ?? FeeMode.NONE;
    const rateValue = policy?.value ?? new Decimal(0);
    const calculationBase = policy?.calculationBase ?? null;

    let goldPricePerGramRial: Decimal | null = null;
    let resolvedSnapshotId: string | null = null;
    let baseAmountRial = new Decimal(0);
    let amountRial = new Decimal(0);

    if (policy && policy.enabled && mode !== FeeMode.NONE) {
      if (mode === FeeMode.FIXED) {
        amountRial = rateValue;
      } else if (mode === FeeMode.PERCENTAGE) {
        const price = await this.resolvePricePerGram(priceSnapshotId);
        goldPricePerGramRial = price.value;
        resolvedSnapshotId = price.snapshotId;
        baseAmountRial = goldPricePerGramRial.times(weightGrams);
        amountRial = baseAmountRial.times(rateValue).dividedBy(100);
      } else {
        throw new Error(`Unsupported fee mode ${mode}`);
      }
      baseAmountRial = baseAmountRial.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      amountRial = amountRial.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    return {
      policy,
      mode,
      rateValue,
      calculationBase,
      baseAmountRial,
      amountRial,
      goldPricePerGramRial,
      priceSnapshotId: resolvedSnapshotId,
    };
  }

  private async resolvePricePerGram(
    priceSnapshotId?: string,
  ): Promise<{ value: Decimal; snapshotId: string }> {
    if (priceSnapshotId) {
      const snapshot = await this.snapshotRepo.findById(priceSnapshotId);
      if (snapshot && snapshot.isValid()) {
        return { value: snapshot.normalizedValue, snapshotId: snapshot.id };
      }
      throw new PickupPriceUnavailableException();
    }
    const current = await this.pricing.getCurrentPrice();
    return {
      value: new Decimal(current.normalizedValue),
      snapshotId: current.snapshotId,
    };
  }
}
