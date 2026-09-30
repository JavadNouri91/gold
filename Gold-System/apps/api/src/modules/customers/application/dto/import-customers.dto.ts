import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LatinDigits } from '../../../../common/latin-digits.decorator';

export class ImportCustomerRowDto {
  @ApiProperty()
  @IsString()
  @Length(2, 100)
  firstName: string;

  @ApiProperty()
  @IsString()
  @Length(2, 100)
  lastName: string;

  @ApiProperty()
  @IsString()
  @Matches(/^\d{10}$/)
  nationalId: string;

  @ApiProperty()
  @LatinDigits()
  @IsString()
  @Matches(/^09\d{9}$/)
  mobile: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  address?: string;
}

export class ImportCustomersDto {
  @ApiProperty({ type: [ImportCustomerRowDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ImportCustomerRowDto)
  rows: ImportCustomerRowDto[];
}
