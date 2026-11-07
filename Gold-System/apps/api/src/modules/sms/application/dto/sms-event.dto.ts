import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  Length,
  MaxLength,
  Matches,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LatinDigits } from '../../../../common/latin-digits.decorator';

export class UpdateSmsEventDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiProperty({ enum: ['USER', 'ADMIN', 'BOTH'] })
  @IsIn(['USER', 'ADMIN', 'BOTH'])
  recipientPolicy!: 'USER' | 'ADMIN' | 'BOTH';
  @ApiProperty() @IsString() @MaxLength(100) templateCode!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(8)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  parameterFields!: string[];
  @ApiProperty({ enum: ['provider_template', 'custom_text'], required: false })
  @IsOptional()
  @IsIn(['provider_template', 'custom_text'])
  sendingMode?: 'provider_template' | 'custom_text';
  @ApiProperty({ maxLength: 1000, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customMessage?: string;
}

export class TestSmsEventDto {
  @ApiProperty({ example: '09120000000' })
  @LatinDigits()
  @IsString()
  @Matches(/^09\d{9}$/)
  @Length(11, 11)
  mobile!: string;
  @ApiProperty({ description: 'Explicit admin confirmation is required.' })
  @IsBoolean()
  confirmed!: boolean;

  @ApiProperty({ enum: ['provider_template', 'custom_text'], required: false })
  @IsOptional()
  @IsIn(['provider_template', 'custom_text'])
  sendingMode?: 'provider_template' | 'custom_text';
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  templateCode?: string;
  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ArrayUnique()
  @IsString({ each: true })
  parameterFields?: string[];
  @ApiProperty({ required: false, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customMessage?: string;
}
