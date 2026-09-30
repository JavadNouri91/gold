import { IsEnum, IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CustomerType } from '@gold/shared-types';

export class AssignCustomerTypeDto {
  @ApiProperty({
    description: 'Customer classification type (BR-C02)',
    enum: CustomerType,
    example: CustomerType.HOUSEHOLD,
  })
  @IsEnum(CustomerType)
  type: CustomerType;

  @ApiProperty({
    description: 'Reason for type assignment (required for audit — BR-C03)',
    example: 'Customer requested Partner tier; documents verified',
  })
  @IsString()
  @IsNotEmpty()
  @Length(5, 500)
  reason: string;
}
