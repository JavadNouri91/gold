import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LatinDigits } from '../../../../common/latin-digits.decorator';

export class CreateUserDto {
  @ApiProperty({ example: 'علی رضایی' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: '09123456789' })
  @LatinDigits()
  @IsNotEmpty()
  @Matches(/^09[0-9]{9}$/, { message: 'Mobile must be a valid Iranian mobile number' })
  mobile: string;

  @ApiPropertyOptional({ example: 'ali@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ minLength: 8 })
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ type: [String], example: ['operator'] })
  @IsOptional()
  @IsString({ each: true })
  roleNames?: string[];
}
