import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsIn,
  IsDateString,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TradeStatus } from '@gold/shared-types';

/**
 * DTO for GET /trades — List Trades
 */
export class ListTradesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(TradeStatus)
  status?: TradeStatus;

  /** Transaction side filter (staff only). */
  @IsOptional()
  @IsIn(['BUY', 'SELL'])
  side?: 'BUY' | 'SELL';

  /** Inclusive start date (ISO Gregorian) on confirmedAt. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Inclusive end date (ISO Gregorian) on confirmedAt. */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** Customer / trade search: name, customer number, mobile or trade number. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}
