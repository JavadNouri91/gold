import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ConnectProductsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 100;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['VALID', 'PARTIAL', 'INVALID']) validationStatus?: string;
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;
  @IsOptional() @IsIn(['MAPPED', 'UNMAPPED']) mappingStatus?: string;
}

export class ConnectProductMappingDto {
  @IsOptional() @IsIn(['INTERNAL_GOLD_WEIGHT', 'UNSUPPORTED']) internalAssetType?: string | null;
  @IsOptional() @IsNumberString() internalGoldPurity?: string | null;
  @IsOptional() @IsString() @MaxLength(100) externalQuantityUnit?: string | null;
  @IsOptional() @IsString() @MaxLength(100) externalPriceCurrency?: string | null;
  @IsOptional() @IsString() @MaxLength(100) priceUnitBasis?: string | null;
  @IsOptional() @IsIn(['CASH_SPOT', 'CASH_TOMORROW', 'CASH_DAY_AFTER_TOMORROW']) cashPriceCategory?: string | null;
  @IsOptional() @IsNumberString() conversionFactor?: string | null;
  @IsOptional() @IsIn(['INTERNAL_BUY', 'INTERNAL_SELL']) connectBuySide?: string | null;
  @IsOptional() @IsIn(['INTERNAL_BUY', 'INTERNAL_SELL']) connectSellSide?: string | null;
}
