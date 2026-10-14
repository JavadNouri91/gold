import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CustomerType,
  FeeCalculationBase,
  FeeChargeCode,
  FeeMode,
  TradeSide,
} from '@gold/shared-types';

export class CreateFeePolicyDto {
  @ApiPropertyOptional({
    description: 'Customer type. null = default fallback for all types without a specific policy.',
    enum: CustomerType,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType | null;

  @ApiProperty({ enum: TradeSide })
  @IsEnum(TradeSide)
  side: TradeSide;

  @ApiPropertyOptional({ enum: FeeChargeCode, default: FeeChargeCode.TRANSACTION_FEE })
  @IsOptional()
  @IsEnum(FeeChargeCode)
  code?: FeeChargeCode;

  @ApiPropertyOptional({ example: 'کارمزد خرید' })
  @IsOptional()
  @IsString()
  labelFa?: string;

  @ApiProperty({ enum: FeeMode })
  @IsEnum(FeeMode)
  mode: FeeMode;

  @ApiProperty({ example: '1.5', description: 'Fixed Rial amount or percentage value' })
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'Must be a non-negative numeric string' })
  value: string;

  @ApiPropertyOptional({
    enum: FeeCalculationBase,
    description: 'Required when mode is PERCENTAGE',
  })
  @ValidateIf((o: CreateFeePolicyDto) => o.mode === FeeMode.PERCENTAGE)
  @IsEnum(FeeCalculationBase)
  calculationBase?: FeeCalculationBase;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  @IsDateString()
  activeFrom: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  activeTo?: string;
}

export class UpdateFeePolicyDto {
  @ApiPropertyOptional({ enum: CustomerType, nullable: true })
  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType | null;

  @ApiPropertyOptional({ enum: TradeSide })
  @IsOptional()
  @IsEnum(TradeSide)
  side?: TradeSide;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  labelFa?: string;

  @ApiPropertyOptional({ enum: FeeMode })
  @IsOptional()
  @IsEnum(FeeMode)
  mode?: FeeMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'Must be a non-negative numeric string' })
  value?: string;

  @ApiPropertyOptional({ enum: FeeCalculationBase, nullable: true })
  @IsOptional()
  calculationBase?: FeeCalculationBase | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  activeFrom?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  activeTo?: string | null;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsString()
  status?: string;
}
