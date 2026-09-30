import { IsEnum, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum KycDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class KycDecisionDto {
  @ApiProperty({
    description: 'Approve or Reject the KYC verification',
    enum: KycDecision,
    example: KycDecision.APPROVE,
  })
  @IsEnum(KycDecision)
  decision: KycDecision;

  @ApiPropertyOptional({
    description: 'Required when decision is REJECT (BR-O06 principle)',
    example: 'National ID document is blurry and unreadable',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(10, 1000)
  reason?: string;
}
