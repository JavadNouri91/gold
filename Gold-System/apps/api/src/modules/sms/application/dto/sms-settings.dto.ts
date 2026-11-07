import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LatinDigits } from '../../../../common/latin-digits.decorator';
import {
  SMS_PROVIDER_NAMES,
  SmsProviderName,
} from '../../infrastructure/providers/sms-provider.interface';

export class UpdateSmsSettingsDto {
  @ApiProperty({ enum: SMS_PROVIDER_NAMES })
  @IsIn(SMS_PROVIDER_NAMES)
  provider!: SmsProviderName;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) apiBaseUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) username?: string;
  @ApiPropertyOptional({ description: 'Omit to keep the existing value; empty string clears it.' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  password?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @LatinDigits()
  @IsString()
  @MaxLength(32)
  originator?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) otpTemplate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(30) @Max(900) otpExpiresInSeconds?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3600)
  otpResendCooldownSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) otpMaxAttempts?: number;

  @ApiPropertyOptional({
    description:
      'API key (SMS.ir) or username (Melipayamak). Omit to keep the stored value, send "" to clear it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  apiKey?: string;

  @ApiPropertyOptional({ description: 'Sender line registered with the provider' })
  @IsOptional()
  @LatinDigits()
  @IsString()
  @MaxLength(32)
  senderLine?: string;

  @ApiPropertyOptional({ description: 'SMS.ir base URL override' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  smsirBaseUrl?: string;

  @ApiPropertyOptional({ description: 'Melipayamak base URL override' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  melipayamakBaseUrl?: string;

  @ApiPropertyOptional({
    description: 'Melipayamak panel password. Omit to keep the stored value, send "" to clear it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  melipayamakPassword?: string;
}

export class SendTestSmsDto {
  @ApiProperty({ example: '09120000000', description: 'Recipient mobile number (Latin digits)' })
  @LatinDigits()
  @IsString()
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست.' })
  @Length(11, 11)
  mobile!: string;

  @ApiProperty({ description: 'Must be explicitly confirmed by the administrator.' })
  @IsBoolean()
  confirmed!: boolean;
}
