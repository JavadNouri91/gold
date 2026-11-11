import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateConnectSettingsDto {
  @IsOptional() @IsString() @MaxLength(300) httpBaseUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) websocketUrl?: string;
  @IsOptional() @IsString() @MaxLength(400) accessKey?: string;
  @IsOptional() @IsString() @MaxLength(400) accessSecret?: string;
  @IsOptional() @IsString() @MaxLength(400) webhookSecret?: string;
  @IsOptional() @IsBoolean() isEnabled?: boolean;
  @IsOptional() @IsBoolean() priceSyncEnabled?: boolean;
  @IsOptional() @IsBoolean() externalBuyEnabled?: boolean;
  @IsOptional() @IsBoolean() externalSellEnabled?: boolean;
}

export class DeleteConnectSecretDto {
  @IsIn(['accessKey', 'accessSecret', 'webhookSecret']) secret!:
    'accessKey' | 'accessSecret' | 'webhookSecret';
  @IsBoolean() confirmed!: boolean;
}
