import { IsEnum, IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum CreditPool {
  RIAL = 'RIAL',
  GOLD_RIAL = 'GOLD_RIAL',
}

export class GrantCreditDto {
  @ApiProperty({
    description:
      'Which credit pool to grant (RIAL = prepaid Rial; GOLD_RIAL = Rial-denominated gold limit)',
    enum: CreditPool,
    example: CreditPool.RIAL,
  })
  @IsEnum(CreditPool)
  pool: CreditPool;

  @ApiProperty({
    description:
      'Amount in Rial (Toman). Must be positive. Never Float — always sent as a string for precision.',
    example: '500000000',
  })
  @IsString()
  @IsNotEmpty()
  amount: string; // string to preserve Decimal precision from client

  @ApiProperty({
    description: 'Reason for credit grant — required per BR-C04',
    example: 'Initial credit grant for approved customer',
  })
  @IsString()
  @IsNotEmpty()
  @Length(5, 500)
  reason: string;
}
