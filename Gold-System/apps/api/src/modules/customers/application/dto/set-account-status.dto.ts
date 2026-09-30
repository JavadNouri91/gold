import { IsEnum, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CustomerAccountStatus } from '@gold/shared-types';

export class SetAccountStatusDto {
  @ApiProperty({ enum: CustomerAccountStatus })
  @IsEnum(CustomerAccountStatus)
  accountStatus: CustomerAccountStatus;

  @ApiProperty({ description: 'Reason recorded in the audit log' })
  @IsString()
  @Length(5, 500)
  reason: string;
}
