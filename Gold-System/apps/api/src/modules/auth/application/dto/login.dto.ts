import { IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LatinDigits } from '../../../../common/latin-digits.decorator';

export class InitiateLoginDto {
  @ApiProperty({ example: '09123456789' })
  @LatinDigits()
  @IsNotEmpty()
  @Matches(/^09[0-9]{9}$/, { message: 'Must be a valid Iranian mobile number' })
  mobile: string;

  @ApiProperty({ minLength: 8 })
  @LatinDigits()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '09123456789' })
  @LatinDigits()
  @IsNotEmpty()
  @Matches(/^09[0-9]{9}$/)
  mobile: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  otp: string;
}

export class RequestPasswordResetDto {
  @ApiProperty({ example: '09123456789' })
  @LatinDigits()
  @IsNotEmpty()
  @Matches(/^09[0-9]{9}$/, { message: 'Must be a valid Iranian mobile number' })
  mobile: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: '09123456789' })
  @LatinDigits()
  @IsNotEmpty()
  @Matches(/^09[0-9]{9}$/, { message: 'Must be a valid Iranian mobile number' })
  mobile: string;

  @ApiProperty({ example: '123456' })
  @LatinDigits()
  @IsNotEmpty()
  @Matches(/^\d{4,8}$/, { message: 'Must be a numeric verification code' })
  otp: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsNotEmpty()
  refreshToken: string;
}

export class LogoutDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
