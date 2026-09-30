import { IsString, IsOptional, MaxLength } from 'class-validator';

/**
 * DTO for POST /trades — Confirm Trade
 *
 * Creates a Trade from an APPROVED Order.
 * §3.3: Credit is moved from reserved → consumed atomically.
 * Order: APPROVED → TRADE_CREATED
 * Quotation: ACTIVE → CONVERTED
 */
export class ConfirmTradeDto {
  /**
   * The ID of the APPROVED Order to create a Trade from.
   * There must be exactly one ACTIVE Quotation associated with this Order.
   */
  @IsString()
  orderId!: string;

  /** Optional confirmation notes */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
