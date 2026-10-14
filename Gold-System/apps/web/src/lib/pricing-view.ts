import type { PricingCalculationResult, PricingChargeLine } from '@/lib/api';
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
  /** Gold commercial (pipeline.finalPrice) — excludes transaction fees */
  finalPrice: string;
  charges: PricingChargeLine[];
  feeTotalRial: string;
  goldCommercialRial: string;
  /** BUY payable / SELL receivable */
  customerTotalRial: string;
  payableRial: string | null;
  receivableRial: string | null;
  side: 'BUY' | 'SELL';
}

function presentAmount(value: string | null | undefined): string | null {
  if (!value || isZeroDecimal(value)) return null;
  return value;
}

export function toPricingView(result: PricingCalculationResult): PricingView {
  const goldValue = result.pipeline.step4_afterWeight;
  const goldCommercial =
    result.goldCommercialRial ?? result.pipeline.finalPrice;
  const customerTotal =
    result.customerTotalRial ?? result.pipeline.finalPrice;
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
    charges: (result.charges ?? []).filter((c) => !isZeroDecimal(c.amount)),
    feeTotalRial: result.feeTotalRial ?? '0.00',
    goldCommercialRial: goldCommercial,
    customerTotalRial: customerTotal,
    payableRial: result.payableRial ?? null,
    receivableRial: result.receivableRial ?? null,
    side: result.side ?? 'BUY',
  };
}

export function basePriceDiffers(view: PricingView): boolean {
  return compareDecimal(view.basePricePerGram, view.unitPricePerGram) !== 0;
}
