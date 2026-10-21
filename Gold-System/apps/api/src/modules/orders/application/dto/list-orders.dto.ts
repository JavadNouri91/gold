import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ORDER_STATUS_QUERY_VALUES } from '@gold/shared-types';

export class ListOrdersDto {
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

  /** Filter by display group or raw OrderStatus — staff only */
  @IsOptional()
  @IsIn([...ORDER_STATUS_QUERY_VALUES])
  status?: string;

  /** Filter by customer ID — staff only */
  @IsOptional()
  @IsString()
  customerId?: string;

  /** Inclusive createdAt start — staff only */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Inclusive createdAt end — staff only */
  @IsOptional()
  @IsISO8601()
  to?: string;
}
