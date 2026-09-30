import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaymentStatus } from '../../domain/constants/payment-methods';

/**
 * Shared query for staff listing and the customer ledger.
 * Customer handlers ignore customerId and always scope by the session.
 */
export class ListPaymentsQueryDto {
  @IsOptional()
  @IsString()
  tradeId?: string;

  /** Staff only. Customers cannot scope another customer this way. */
  @IsOptional()
  @IsString()
  customerId?: string;

  /** Exact payment status. Staff listing only. */
  @IsOptional()
  @IsIn(Object.values(PaymentStatus))
  status?: PaymentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(['successful', 'failed', 'reversed', 'submitted'])
  statusGroup?: 'successful' | 'failed' | 'reversed' | 'submitted';

  @IsOptional()
  @IsIn(['BUY', 'SELL', 'OTHER'])
  type?: 'BUY' | 'SELL' | 'OTHER';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}
