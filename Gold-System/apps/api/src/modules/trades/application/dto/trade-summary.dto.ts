/**
 * Trade Summary DTO — all-time aggregate for the trades hero cards.
 *
 * Counts:
 *   - totalTrades:      every Trade row
 *   - confirmedTrades:  status = CONFIRMED (successful transactions)
 *   - reversedTrades:   status = REVERSED
 *
 * Totals (excluding REVERSED, matching the reports dashboard):
 *   - totalWeightGrams  (6dp) and totalTurnoverRial (2dp)
 *
 * Side split (BUY/SELL) sums only non-REVERSED trades. The snapshot side is
 * authoritative and falls back to the source order-item metadata, mirroring
 * confirmTrade() and TradeResponseDto.fromEntity().
 */
export class TradeSideSummaryDto {
  count: number;
  weightGrams: string;
  turnoverRial: string;
}

export class TradeSummaryDto {
  totalTrades: number;
  confirmedTrades: number;
  reversedTrades: number;

  totalWeightGrams: string;
  totalTurnoverRial: string;

  buy: TradeSideSummaryDto;
  sell: TradeSideSummaryDto;

  /** Weight share of BUY trades, 1dp; null when total weight is 0. */
  buyRatioPercent: number | null;
}
