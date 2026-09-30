import { IsOptional, IsEnum, IsInt, Min, Max, IsString, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerAccountStatus, CustomerStatus, CustomerType } from '@gold/shared-types';
import {
  CustomerFinancialStatus,
  CustomerSegment,
  CustomerVerificationStatus,
} from '../customer-directory.policy';

export class ListCustomersDto {
  @ApiPropertyOptional({ enum: CustomerStatus })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @ApiPropertyOptional({ enum: CustomerType })
  @IsOptional()
  @IsEnum(CustomerType)
  type?: CustomerType;

  @ApiPropertyOptional({ description: 'Search by name, mobile, national ID, or customer number' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: CustomerAccountStatus })
  @IsOptional()
  @IsEnum(CustomerAccountStatus)
  accountStatus?: CustomerAccountStatus;

  @ApiPropertyOptional({ enum: CustomerVerificationStatus })
  @IsOptional()
  @IsEnum(CustomerVerificationStatus)
  verificationStatus?: CustomerVerificationStatus;

  @ApiPropertyOptional({ enum: CustomerSegment })
  @IsOptional()
  @IsEnum(CustomerSegment)
  segment?: CustomerSegment;

  @ApiPropertyOptional({ enum: CustomerFinancialStatus })
  @IsOptional()
  @IsEnum(CustomerFinancialStatus)
  financialStatus?: CustomerFinancialStatus;

  @ApiPropertyOptional({ description: 'Registration date from (YYYY-MM-DD, Asia/Tehran)' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'Registration date to (YYYY-MM-DD, Asia/Tehran)' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ description: 'Last purchase date from (YYYY-MM-DD, Asia/Tehran)' })
  @IsOptional()
  @IsDateString()
  lastPurchaseFrom?: string;

  @ApiPropertyOptional({ description: 'Last purchase date to (YYYY-MM-DD, Asia/Tehran)' })
  @IsOptional()
  @IsDateString()
  lastPurchaseTo?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
