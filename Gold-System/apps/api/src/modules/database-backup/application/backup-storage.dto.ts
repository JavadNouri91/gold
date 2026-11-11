import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBackupStorageDto {
  @IsBoolean() enabled!: boolean;
  @IsString() @MaxLength(2048) endpoint!: string;
  @IsString() @MaxLength(64) region!: string;
  @IsString() @MaxLength(63) bucket!: string;
  @IsString() @MaxLength(512) prefix!: string;
  @IsBoolean() forcePathStyle!: boolean;
  @IsBoolean() allowHttp!: boolean;
  @IsOptional() @IsString() @MaxLength(256) accessKeyId?: string;
  @IsOptional() @IsString() @MaxLength(4096) secretAccessKey?: string;
}
