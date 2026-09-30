import { IsString, MinLength, MaxLength } from 'class-validator';

/**
 * DTO for POST /trades/:id/reverse — Reverse Trade
 *
 * Reverses a CONFIRMED Trade under exceptional circumstances.
 * §4.2: Manager authorization required.
 * §4.2: A documented reason is mandatory.
 *
 * Credit: consumedCreditRial -= trade.totalAmountRial (back to available)
 *
 * NOTE: Financial/Gold Ledger reversal entries are Phase 4 (deferred).
 */
export class ReverseTradeDto {
  /**
   * Documented reason for reversal.
   * BR-O06 (by extension): reason is mandatory for destructive operations.
   */
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}
