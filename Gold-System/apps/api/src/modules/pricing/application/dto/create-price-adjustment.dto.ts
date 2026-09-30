import { IsString, IsNotEmpty, IsEnum, IsOptional, IsDateString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdjustmentMode, AdjustmentDirection } from '@gold/shared-types';

export class CreatePriceAdjustmentDto {
  @ApiProperty({ description: 'Descriptive name', example: 'Global +2% seller margin' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'PERCENTAGE or FIXED (BR-P04)',
    enum: AdjustmentMode,
    example: AdjustmentMode.PERCENTAGE,
  })
  @IsEnum(AdjustmentMode)
  mode: AdjustmentMode;

  @ApiProperty({
    description: 'INCREASE or DECREASE',
    enum: AdjustmentDirection,
    example: AdjustmentDirection.INCREASE,
  })
  @IsEnum(AdjustmentDirection)
  direction: AdjustmentDirection;

  @ApiProperty({
    description:
      'Value: percentage (0–100) for PERCENTAGE mode; Rial amount for FIXED mode. String for precision.',
    example: '2.0',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d+)?$/, { message: 'value must be a non-negative numeric string' })
  value: string;

  @ApiProperty({
    description: 'When this adjustment becomes effective',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsDateString()
  effectiveFrom: string;

  @ApiPropertyOptional({ description: 'When this adjustment expires (null = no expiry)' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
