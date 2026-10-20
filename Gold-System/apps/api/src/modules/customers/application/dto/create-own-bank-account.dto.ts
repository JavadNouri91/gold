import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LatinDigits } from '../../../../common/latin-digits.decorator';

export class CreateOwnBankAccountDto {
  @ApiProperty({ example: 'IR120560084200001234567890' })
  @LatinDigits()
  @IsString()
  @MinLength(10, { message: 'شماره شبا معتبر نیست' })
  @MaxLength(40, { message: 'شماره شبا معتبر نیست' })
  iban!: string;
}
