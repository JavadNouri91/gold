import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PhysicalGoldPickupStatus } from '../../domain/constants/pickup-states';

export class ListStaffPickupsDto {
  @IsOptional()
  @IsEnum(PhysicalGoldPickupStatus)
  status?: PhysicalGoldPickupStatus;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  actionRequired?: string;

  @IsOptional()
  @IsIn(['today', 'last7', 'last30', 'custom', 'all'])
  dateRange?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
