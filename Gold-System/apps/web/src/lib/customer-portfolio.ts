/**
 * Customer melted-gold position shown on دارایی من.
 *
 * Net grams come from booked buy minus booked sell (`GET /orders/portfolio`).
 * Live market value is the current snapshot price times that net weight.
 * Unclassified orders are not treated as inventory.
 */

import { addDecimal, isZeroDecimal, multiplyDecimal, ratioPercent, subtractDecimal } from './decimal-string';

export interface CustomerHolding {
  weightGrams: string;
  confirmedWeightGrams?: string;
  ownedGoldGrams?: string;
  reservedPickupGrams?: string;
  pendingPurchaseGrams?: string;
  pendingPurchaseAmountRial?: string;
  purityRatio: string | null;
  averageBuyPriceRial: string | null;
  totalBuyValueRial: string | null;
  totalSellValueRial: string | null;
}

export interface PortfolioAssetSlice {
  id: string;
  label: string;
  weightGrams: string;
  /** Display share of quantity, 0–100. Supplied by the server, not computed here. */
  share: number;
}

export interface PortfolioPosition {
  weightGrams: string;
  confirmedWeightGrams?: string;
  ownedGoldGrams?: string;
  reservedPickupGrams: string;
  pendingPurchaseGrams?: string;
  pendingPurchaseAmountRial?: string;
  purityLabel: string | null;
  averageBuyPriceRial: string | null;
  marketValueRial: string | null;
  confirmedMarketValueRial?: string | null;
  pendingDeliveryValueRial?: string | null;
  totalOwnedGoldValueRial?: string | null;
  changeRial: string | null;
  changePercent: string | null;
  realizedPnlRial: string | null;
  unrealizedPnlRial: string | null;
  totalBuyValueRial: string | null;
  totalSellValueRial: string | null;
  assets: PortfolioAssetSlice[];
}

export function purityMillisLabel(ratio: string | null | undefined): string | null {
  if (!ratio) return null;
  const value = Number(ratio);
  if (!Number.isFinite(value) || value <= 0) return null;
  return String(Math.round(value * 1000));
}

export function remainingCostRial(holding: CustomerHolding): string | null {
  if (!holding.averageBuyPriceRial || isZeroDecimal(holding.weightGrams)) return null;
  return multiplyDecimal(holding.averageBuyPriceRial, holding.weightGrams);
}

export function toPortfolioPosition(
  holding: CustomerHolding | null | undefined,
  livePricePerGram?: string | null,
): PortfolioPosition | null {
  if (!holding) return null;
  const marketValueRial =
    livePricePerGram && !isZeroDecimal(holding.weightGrams)
      ? multiplyDecimal(holding.weightGrams, livePricePerGram)
      : null;
  const confirmedWeightGrams = holding.confirmedWeightGrams ?? holding.weightGrams;
  const ownedGoldGrams = holding.ownedGoldGrams ?? confirmedWeightGrams;
  const confirmedMarketValueRial =
    livePricePerGram && !isZeroDecimal(confirmedWeightGrams)
      ? multiplyDecimal(confirmedWeightGrams, livePricePerGram)
      : null;
  const pendingDeliveryValueRial =
    livePricePerGram && !isZeroDecimal(holding.reservedPickupGrams ?? '0')
      ? multiplyDecimal(holding.reservedPickupGrams!, livePricePerGram)
      : null;
  const totalOwnedGoldValueRial =
    confirmedMarketValueRial == null && pendingDeliveryValueRial == null
      ? null
      : addDecimal(confirmedMarketValueRial ?? '0', pendingDeliveryValueRial ?? '0');
  const cost = remainingCostRial(holding);
  const changeRial =
    marketValueRial != null && cost != null ? subtractDecimal(marketValueRial, cost) : null;
  const changePercent =
    changeRial != null && cost != null && !isZeroDecimal(cost)
      ? ratioPercent(changeRial, cost)
      : null;

  return {
    pendingPurchaseGrams: holding.pendingPurchaseGrams ?? '0.000000',
    pendingPurchaseAmountRial: holding.pendingPurchaseAmountRial ?? '0.00',
    weightGrams: holding.weightGrams,
    confirmedWeightGrams,
    ownedGoldGrams,
    reservedPickupGrams: holding.reservedPickupGrams ?? '0.000000',
    purityLabel: purityMillisLabel(holding.purityRatio),
    averageBuyPriceRial: holding.averageBuyPriceRial,
    marketValueRial,
    confirmedMarketValueRial,
    pendingDeliveryValueRial,
    totalOwnedGoldValueRial,
    changeRial,
    changePercent,
    realizedPnlRial: null,
    unrealizedPnlRial: changeRial,
    totalBuyValueRial: holding.totalBuyValueRial,
    totalSellValueRial: holding.totalSellValueRial,
    assets: [
      {
        id: 'melted',
        label: 'طلای آبشده',
        weightGrams: holding.weightGrams,
        share: 100,
      },
    ],
  };
}

export function isRegisteredHolding(
  position: PortfolioPosition | null,
): position is PortfolioPosition {
  if (!position) return false;
  const weight = position.weightGrams.trim();
  if (!weight || weight.startsWith('-')) return false;
  return !/^0+(\.0+)?$/.test(weight);
}

export function loadCustomerPosition(): PortfolioPosition | null {
  return null;
}
