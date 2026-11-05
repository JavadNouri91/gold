import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LatinDigits } from '../../../../common/latin-digits.decorator';

export class CreateOwnBankAccountDto {
  @ApiProperty({ example: 'IR120560084200001234567890' })
  @LatinDigits()
  @IsString()
  @MinLength(10, { message: 'شماره شبا معتبر نیست' })
  @MaxLength(40, { message: 'شماره شبا معتبر نیست' })
  iban!: string;

  @ApiProperty({ example: 'ملی', required: false })
  @IsOptional() @IsString() @MaxLength(80)
  bankName?: string;

  @ApiProperty({ example: '6037991234567890', required: false })
  @IsOptional() @LatinDigits() @IsString() @MaxLength(19)
  cardNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional() @LatinDigits() @IsString() @MaxLength(30)
  accountNumber?: string;
}
