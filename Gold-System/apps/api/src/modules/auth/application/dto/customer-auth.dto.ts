import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Mobile } from '../../domain/mobile';
import { LatinDigits } from '../../../../common/latin-digits.decorator';

export class MobileDto {
  @Mobile()
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست.' })
  mobile: string;
}

export class CustomerPasswordDto extends MobileDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class RegistrationDto extends CustomerPasswordDto {
  @IsString()
  @Matches(/\S/, { message: 'نام الزامی است.' })
  @MaxLength(100)
  firstName: string;

  @IsString()
  @Matches(/\S/, { message: 'نام خانوادگی الزامی است.' })
  @MaxLength(100)
  lastName: string;

  @IsString()
  @MaxLength(128)
  confirmPassword: string;
}

export class CustomerOtpDto extends MobileDto {
  @LatinDigits()
  @Matches(/^\d{6}$/, { message: 'کد تأیید باید شش رقم باشد.' })
  otp: string;
}

export class CompleteResetDto extends MobileDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  resetGrant: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;

  @IsString()
  @MaxLength(128)
  confirmPassword: string;
}
