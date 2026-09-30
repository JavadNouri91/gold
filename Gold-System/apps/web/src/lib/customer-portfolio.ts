/**
 * Customer melted-gold position, as the portal is allowed to know it.
 *
 * The gold ledger (GA-01 store position, GA-02 customer obligation, GA-03
 * adjustment) is a store book. It is not a per-customer holding, and staff
 * report endpoints are not available to the signed-in customer.
 *
 * Trades have weight and price, but no buy/sell side, so a personal balance,
 * average acquisition price, or profit/loss cannot be derived here without
 * inventing a financial engine. Until a customer portfolio endpoint exists,
 * `position` stays null and the page shows the empty-holding state.
 *
 * Historical charts are not part of this module. They live in
 * `portfolio-history-preview.ts` and must stay labeled as a preview.
 */

export interface PortfolioAssetSlice {
  id: string;
  label: string;
  weightGrams: string;
  /** Display share of quantity, 0–100. Supplied by the server, not computed here. */
  share: number;
}

export interface PortfolioPosition {
  weightGrams: string;
  purityLabel: string | null;
  averageBuyPriceRial: string | null;
  marketValueRial: string | null;
  changeRial: string | null;
  changePercent: string | null;
  realizedPnlRial: string | null;
  unrealizedPnlRial: string | null;
  totalBuyValueRial: string | null;
  totalSellValueRial: string | null;
  assets: PortfolioAssetSlice[];
}

/** No customer-scoped gold position is available from the current API. */
export function loadCustomerPosition(): PortfolioPosition | null {
  return null;
}

export function isRegisteredHolding(position: PortfolioPosition | null): position is PortfolioPosition {
  if (!position) return false;
  const weight = position.weightGrams.trim();
  if (!weight || weight.startsWith('-')) return false;
  return !/^0+(\.0+)?$/.test(weight);
}
