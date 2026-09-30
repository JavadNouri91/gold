import { IsIn, IsNumberString, IsOptional, IsString, Matches } from 'class-validator';

/**
 * DTO for creating a new DRAFT order.
 *
 * The customer provides weight and purity; the system calls the Pricing Engine
 * to compute the total amount and creates a linked PricingCalculation.
 *
 * Amounts are submitted as strings to preserve Decimal precision (BR-P05).
 */
export class CreateOrderDto {
  /**
   * Weight of gold in grams.
   * Must be a positive decimal number string, e.g. "100.5" or "0.5".
   */
  @IsNumberString({}, { message: 'weightGrams must be a valid decimal number string' })
  @Matches(/^\d+(\.\d{1,6})?$/, { message: 'weightGrams supports up to 6 decimal places' })
  weightGrams: string;

  /**
   * Gold purity ratio in the range (0, 1].
   * E.g. "0.750" for 18K gold, "0.999" for 24K gold.
   */
  @IsNumberString({}, { message: 'purityRatio must be a valid decimal number string' })
  @Matches(/^0?\.\d{1,6}$|^1(\.0{1,6})?$/, {
    message: 'purityRatio must be between 0 (exclusive) and 1 (inclusive), e.g. "0.750"',
  })
  purityRatio: string;

  /**
   * Optional: specific price snapshot ID to use for pricing.
   * If omitted, the latest valid snapshot is used.
   */
  @IsOptional()
  @IsString()
  priceSnapshotId?: string;

  /**
   * Customer intent recorded at creation.
   * Absent on older orders; those stay unclassified in activity totals.
   */
  @IsOptional()
  @IsIn(['BUY', 'SELL'])
  side?: 'BUY' | 'SELL';
}
