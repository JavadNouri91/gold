import { IsEmail, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LatinDigits } from '../../../../common/latin-digits.decorator';

/**
 * Customer self-service contact update.
 * Identity fields (name, national ID, mobile, date of birth) are intentionally absent.
 */
export class UpdateOwnProfileDto {
  @ApiPropertyOptional({ description: 'Contact email. Empty string clears it.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsEmail({}, { message: 'ایمیل معتبر نیست' })
  email?: string;

  @ApiPropertyOptional({ description: 'Postal address' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'آدرس بیش از حد طولانی است' })
  address?: string;

  @ApiPropertyOptional({ description: '10-digit postal code. Empty string clears it.' })
  @LatinDigits()
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsString()
  @Matches(/^\d{10}$/, { message: 'کد پستی باید ۱۰ رقم باشد' })
  postalCode?: string;
}
