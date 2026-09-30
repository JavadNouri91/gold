import { IsString, IsOptional, IsEnum, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerType } from '@gold/shared-types';

/**
 * DTO for price calculation request.
 *
 * Amounts are string-encoded Decimals to preserve precision (BR-P05).
 * Clients must send numeric strings, not JavaScript floats.
 */
export class CalculatePriceDto {
  @ApiProperty({
    description: 'Weight in grams — positive decimal string. e.g. "10.500"',
    example: '10.500',
  })
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'weightGrams must be a positive numeric string' })
  weightGrams: string;

  @ApiProperty({
    description:
      'Purity ratio (0, 1] — e.g. "0.750" for 18K gold. Stored; conversion DEFERRED until §13.1 resolved.',
    example: '0.750',
  })
  @IsString()
  @Matches(/^0?\.\d+$|^1(\.0+)?$/, {
    message: 'purityRatio must be a decimal between 0 (exclusive) and 1 (inclusive)',
  })
  purityRatio: string;

  @ApiPropertyOptional({
    description:
      'Customer type for group pricing rule (Step 5). If omitted, no group rule is applied.',
    enum: CustomerType,
    example: CustomerType.HOUSEHOLD,
  })
  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @ApiPropertyOptional({
    description: 'Specific PriceSnapshot ID to use. If omitted, the latest valid snapshot is used.',
  })
  @IsOptional()
  @IsString()
  priceSnapshotId?: string;

  @ApiPropertyOptional({
    description: 'Order-level discount amount in Rial (Toman). Applied at Step 8.',
    example: '50000',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, {
    message: 'orderLevelDiscountAmount must be a positive numeric string',
  })
  orderLevelDiscountAmount?: string;
}
