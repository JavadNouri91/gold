import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmLoginSessionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  confirmationToken!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  revokeSessionId!: string;
}

export class CloseOtherSessionsLoginDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  confirmationToken!: string;
}
