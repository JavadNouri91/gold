import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsMobilePhone,
  Length,
  MinLength,
  IsDateString,
  Matches,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LatinDigits } from '../../../../common/latin-digits.decorator';
import {
  CustomerType,
  CustomerGender,
  CustomerLevel,
  ReferenceSource,
  CustomerAccountStatus,
} from '@gold/shared-types';

export class RegisterCustomerDto {
  @ApiProperty({ description: 'First name (نام)', example: 'علی' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  firstName: string;

  @ApiProperty({ description: 'Last name (نام خانوادگی)', example: 'محمدی' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  lastName: string;

  @ApiProperty({
    description: 'Iranian national ID (کد ملی) — 10 digits',
    example: '0012345678',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10}$/, { message: 'nationalId must be exactly 10 digits' })
  nationalId: string;

  @ApiProperty({
    description: 'Mobile number in Iranian format',
    example: '09123456789',
  })
  @LatinDigits()
  @IsString()
  @IsNotEmpty()
  @IsMobilePhone('fa-IR', {}, { message: 'mobile must be a valid Iranian mobile number' })
  mobile: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'ali@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Date of birth in ISO format',
    example: '1985-06-15',
  })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Residential address', example: 'تهران، خیابان آزادی' })
  @IsOptional()
  @IsString()
  @Length(5, 500)
  address?: string;

  @ApiProperty({
    description: 'Password (min 8 chars)',
    example: 'SecurePass123!',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  // ── Extended staff registration fields ──────────────────────────────────────

  @ApiPropertyOptional({ description: 'Customer type', enum: CustomerType })
  @IsOptional()
  @IsEnum(CustomerType)
  type?: CustomerType;

  @ApiPropertyOptional({ description: 'Gender', enum: CustomerGender })
  @IsOptional()
  @IsEnum(CustomerGender)
  gender?: CustomerGender;

  @ApiPropertyOptional({ description: 'Customer level / tier', enum: CustomerLevel })
  @IsOptional()
  @IsEnum(CustomerLevel)
  level?: CustomerLevel;

  @ApiPropertyOptional({ description: 'Postal code — 10 digits', example: '1234567890' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'postalCode must be exactly 10 digits' })
  postalCode?: string;

  @ApiPropertyOptional({ description: 'Landline phone', example: '02112345678' })
  @IsOptional()
  @IsString()
  @Length(8, 20)
  phone?: string;

  @ApiPropertyOptional({ description: 'How did you hear about us', enum: ReferenceSource })
  @IsOptional()
  @IsEnum(ReferenceSource)
  referenceSource?: ReferenceSource;

  @ApiPropertyOptional({ description: 'Internal staff note (not customer-visible)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNote?: string;

  @ApiPropertyOptional({
    description: 'Initial account status for staff-created customers',
    enum: CustomerAccountStatus,
  })
  @IsOptional()
  @IsEnum(CustomerAccountStatus)
  initialAccountStatus?: CustomerAccountStatus;

  // ── Company / corporate fields (only for type = CORPORATE) ──────────────────

  @ApiPropertyOptional({ description: 'Company name (for corporate customers)' })
  @IsOptional()
  @IsString()
  @Length(2, 200)
  companyName?: string;

  @ApiPropertyOptional({ description: 'Company national ID (شناسه ملی شرکت)' })
  @IsOptional()
  @IsString()
  @Length(10, 15)
  companyNationalId?: string;

  @ApiPropertyOptional({ description: 'Company economic ID (شماره اقتصادی)' })
  @IsOptional()
  @IsString()
  @Length(8, 20)
  companyEconomicId?: string;

  @ApiPropertyOptional({ description: 'Contact person name (نام مسئول)' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  contactName?: string;

  @ApiPropertyOptional({ description: 'Contact person title (سمت مسئول)' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  contactTitle?: string;

  // ── Extended contact fields ──────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Secondary mobile number' })
  @LatinDigits()
  @IsOptional()
  @IsString()
  @Matches(/^09\d{9}$/, { message: 'secondaryMobile must be a valid Iranian mobile number' })
  secondaryMobile?: string;

  @ApiPropertyOptional({ description: 'Work phone number' })
  @IsOptional()
  @IsString()
  @Length(8, 20)
  workPhone?: string;

  @ApiPropertyOptional({ description: 'Fax number' })
  @IsOptional()
  @IsString()
  @Length(8, 20)
  fax?: string;

  @ApiPropertyOptional({ description: 'Work address' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  workAddress?: string;

  @ApiPropertyOptional({ description: 'Contact notes (staff-visible)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  contactNotes?: string;

  @ApiPropertyOptional({ description: 'Province (استان)' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  province?: string;

  @ApiPropertyOptional({ description: 'City (شهر)' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  city?: string;
}
