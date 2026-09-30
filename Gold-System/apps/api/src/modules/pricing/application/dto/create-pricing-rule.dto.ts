import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsDateString,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerType } from '@gold/shared-types';

export class CreatePricingRuleDto {
  @ApiProperty({ example: 'HOUSEHOLD Standard Rule 2026' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description:
      'CustomerType this rule applies to. null = default rule for all types without a specific rule.',
    enum: CustomerType,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  // ── Step 5: Customer group price adjustment ────────────────
  @ApiPropertyOptional({
    description: 'Group adjustment mode: NONE or PERCENTAGE',
    enum: ['NONE', 'PERCENTAGE'],
    default: 'NONE',
  })
  @IsOptional()
  @IsEnum(['NONE', 'PERCENTAGE'])
  groupAdjMode?: 'NONE' | 'PERCENTAGE';

  @ApiPropertyOptional({
    description: 'Group adjustment value — e.g. "2.5" for 2.5%',
    example: '2.5',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'Must be a non-negative numeric string' })
  groupAdjValue?: string;

  @ApiPropertyOptional({
    description: 'Group adjustment direction',
    enum: ['INCREASE', 'DECREASE'],
    default: 'INCREASE',
  })
  @IsOptional()
  @IsEnum(['INCREASE', 'DECREASE'])
  groupAdjDirection?: 'INCREASE' | 'DECREASE';

  // ── Wage ──────────────────────────────────────────────────
  @ApiPropertyOptional({
    description: 'Wage mode (§1.6 — NONE by default for molten gold)',
    enum: ['NONE', 'FIXED', 'PERCENTAGE'],
    default: 'NONE',
  })
  @IsOptional()
  @IsEnum(['NONE', 'FIXED', 'PERCENTAGE'])
  wageMode?: 'NONE' | 'FIXED' | 'PERCENTAGE';

  @ApiPropertyOptional({ example: '0', description: 'Wage value (Rial or %)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'Must be a non-negative numeric string' })
  wageValue?: string;

  // ── Discount ──────────────────────────────────────────────
  @ApiPropertyOptional({
    description: 'Discount mode (§1.3 — applied after tax position)',
    enum: ['NONE', 'FIXED', 'PERCENTAGE'],
    default: 'NONE',
  })
  @IsOptional()
  @IsEnum(['NONE', 'FIXED', 'PERCENTAGE'])
  discountMode?: 'NONE' | 'FIXED' | 'PERCENTAGE';

  @ApiPropertyOptional({ example: '0', description: 'Discount value (Rial or %)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'Must be a non-negative numeric string' })
  discountValue?: string;

  // ── Rounding ──────────────────────────────────────────────
  @ApiPropertyOptional({
    description: 'Rounding method (§1.7)',
    enum: ['NONE', 'ROUND_UP', 'ROUND_DOWN', 'ROUND_NEAREST'],
    default: 'NONE',
  })
  @IsOptional()
  @IsEnum(['NONE', 'ROUND_UP', 'ROUND_DOWN', 'ROUND_NEAREST'])
  roundingMethod?: 'NONE' | 'ROUND_UP' | 'ROUND_DOWN' | 'ROUND_NEAREST';

  @ApiPropertyOptional({
    description: 'Rounding precision — e.g. "1000" for nearest 1,000 Toman',
    example: '1000',
    default: '1',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'Must be a positive numeric string' })
  roundingPrecision?: string;

  // ── Validity ──────────────────────────────────────────────
  @ApiProperty({
    description: 'Rule becomes active from this date',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsDateString()
  activeFrom: string;

  @ApiPropertyOptional({ description: 'Rule expires at this date (null = no expiry)' })
  @IsOptional()
  @IsDateString()
  activeTo?: string;

  @ApiPropertyOptional({
    description: 'Priority — higher value wins when multiple rules match',
    example: 10,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}
