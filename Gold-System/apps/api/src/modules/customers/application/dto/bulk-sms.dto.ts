import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, IsUUID, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkSmsDto {
  @ApiProperty({ type: [String], description: 'Customer IDs to message (max 50)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiProperty({ description: 'SMS body text', example: 'پیام اطلاع‌رسانی سامانه طلا' })
  @IsString()
  @Length(5, 500)
  body: string;
}
