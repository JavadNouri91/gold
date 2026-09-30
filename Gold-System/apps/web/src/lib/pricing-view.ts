import type { PricingCalculationResult } from '@/lib/api';
import { compareDecimal, isZeroDecimal, subtractDecimal } from '@/lib/decimal-string';

/** Display fields taken from the pricing pipeline. No client-side price formula. */
export interface PricingView {
  calculationId: string;
  snapshotId: string;
  weightGrams: string;
  purityRatio: string;
  basePricePerGram: string;
  unitPricePerGram: string;
  goldValue: string;
  groupAdjustment: string;
  wageAmount: string | null;
  profitAmount: string | null;
  taxAmount: string | null;
  discountAmount: string | null;
  roundingAmount: string | null;
  finalPrice: string;
}

function presentAmount(value: string | null | undefined): string | null {
  if (!value || isZeroDecimal(value)) return null;
  return value;
}

export function toPricingView(result: PricingCalculationResult): PricingView {
  const goldValue = result.pipeline.step4_afterWeight;
  return {
    calculationId: result.calculationId,
    snapshotId: result.meta.snapshotId,
    weightGrams: result.meta.weightGrams,
    purityRatio: result.meta.purityRatio,
    basePricePerGram: result.pipeline.step1_basePrice,
    unitPricePerGram: result.pipeline.step2_afterGlobalAdj,
    goldValue,
    groupAdjustment: subtractDecimal(result.pipeline.step5_afterGroupRule, goldValue),
    wageAmount: presentAmount(result.pipeline.wageAmount),
    profitAmount: presentAmount(result.pipeline.profitAmount),
    taxAmount: presentAmount(result.pipeline.taxAmount),
    discountAmount: presentAmount(result.pipeline.discountAmount),
    roundingAmount: presentAmount(result.pipeline.roundingAmount),
    finalPrice: result.pipeline.finalPrice,
  };
}

export function basePriceDiffers(view: PricingView): boolean {
  return compareDecimal(view.basePricePerGram, view.unitPricePerGram) !== 0;
}
