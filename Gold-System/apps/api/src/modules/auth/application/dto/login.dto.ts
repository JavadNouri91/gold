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
