import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '@gold/shared-types';

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

  /** Filter by status — staff only; customers always see their own orders */
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  /** Filter by customer ID — staff only */
  @IsOptional()
  @IsString()
  customerId?: string;
}
