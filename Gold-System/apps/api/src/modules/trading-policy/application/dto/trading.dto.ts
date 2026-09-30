import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { TRADING_WEEKDAYS } from '../../domain/trading.types';

const KINDS = ['FULL_CLOSURE', 'SPECIAL_SCHEDULE'] as const;
const SCOPES = ['GLOBAL', 'ROLE', 'USER', 'CUSTOMER', 'TRANSACTION_TYPE'] as const;

export class OverviewQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class AuditQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class SessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(TRADING_WEEKDAYS)
  weekday?: (typeof TRADING_WEEKDAYS)[number] | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  dayOverrideId?: string | null;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  maxAmountRial?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  minAmountRial?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  maxWeightGrams?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  minWeightGrams?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  maxCount?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  maxSingleAmountRial?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  maxSingleWeightGrams?: string | null;
}

export class CopySessionDto {
  @IsArray()
  @IsIn(TRADING_WEEKDAYS, { each: true })
  weekdays!: (typeof TRADING_WEEKDAYS)[number][];
}

export class OverrideDto {
  @IsString()
  date!: string;

  @IsIn(KINDS)
  kind!: (typeof KINDS)[number];

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  startTime?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  endTime?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  maxAmountRial?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  minAmountRial?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  maxWeightGrams?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  minWeightGrams?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  maxCount?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  maxSingleAmountRial?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  maxSingleWeightGrams?: string | null;
}

export class LimitDto {
  @IsString()
  sessionId!: string;

  @IsIn(SCOPES)
  scope!: (typeof SCOPES)[number];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  scopeKey?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  maxAmountRial?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  minAmountRial?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  maxWeightGrams?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  minWeightGrams?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  maxCount?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  maxSingleAmountRial?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  maxSingleWeightGrams?: string | null;
}
