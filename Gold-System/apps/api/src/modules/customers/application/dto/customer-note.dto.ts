import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCustomerNoteDto {
  @ApiProperty()
  @IsString()
  @Length(1, 2000)
  body: string;
}
