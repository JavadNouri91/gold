import { IsBoolean, IsIn, IsInt, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ALLOWED_SESSION_LIMITS } from '../../domain/session-policy';

const LIMIT_TYPES = ['LIMITED', 'UNLIMITED'] as const;
const GLOBAL_BEHAVIORS = ['BLOCK', 'REVOKE_OLDEST', 'REQUIRE_CONFIRMATION'] as const;
const CUSTOM_BEHAVIORS = ['BLOCK', 'REVOKE_OLDEST'] as const;

export class UpdateGlobalSessionPolicyDto {
  @ApiProperty({ enum: LIMIT_TYPES })
  @IsIn(LIMIT_TYPES)
  limitType!: 'LIMITED' | 'UNLIMITED';

  @ApiPropertyOptional({ enum: ALLOWED_SESSION_LIMITS })
  @ValidateIf((dto: UpdateGlobalSessionPolicyDto) => dto.limitType === 'LIMITED')
  @IsInt()
  @IsIn(ALLOWED_SESSION_LIMITS)
  maxSessions?: number;

  @ApiProperty({ enum: GLOBAL_BEHAVIORS })
  @IsIn(GLOBAL_BEHAVIORS)
  loginBehavior!: 'BLOCK' | 'REVOKE_OLDEST' | 'REQUIRE_CONFIRMATION';
}

export class UpdateRoleSessionPolicyDto {
  @ApiProperty()
  @IsBoolean()
  useDefault!: boolean;

  @ApiPropertyOptional({ enum: LIMIT_TYPES })
  @ValidateIf((dto: UpdateRoleSessionPolicyDto) => !dto.useDefault)
  @IsIn(LIMIT_TYPES)
  limitType?: 'LIMITED' | 'UNLIMITED';

  @ApiPropertyOptional({ enum: ALLOWED_SESSION_LIMITS })
  @ValidateIf((dto: UpdateRoleSessionPolicyDto) => !dto.useDefault && dto.limitType === 'LIMITED')
  @IsInt()
  @IsIn(ALLOWED_SESSION_LIMITS)
  maxSessions?: number;

  @ApiPropertyOptional({ enum: CUSTOM_BEHAVIORS })
  @ValidateIf((dto: UpdateRoleSessionPolicyDto) => !dto.useDefault)
  @IsIn(CUSTOM_BEHAVIORS)
  loginBehavior?: 'BLOCK' | 'REVOKE_OLDEST';
}

export class UpdateUserSessionPolicyDto {
  @ApiProperty({ enum: ['INHERIT', 'CUSTOM'] })
  @IsIn(['INHERIT', 'CUSTOM'])
  mode!: 'INHERIT' | 'CUSTOM';

  @ApiPropertyOptional({ enum: LIMIT_TYPES })
  @ValidateIf((dto: UpdateUserSessionPolicyDto) => dto.mode === 'CUSTOM')
  @IsIn(LIMIT_TYPES)
  limitType?: 'LIMITED' | 'UNLIMITED';

  @ApiPropertyOptional({ enum: ALLOWED_SESSION_LIMITS })
  @ValidateIf(
    (dto: UpdateUserSessionPolicyDto) => dto.mode === 'CUSTOM' && dto.limitType === 'LIMITED',
  )
  @IsInt()
  @IsIn(ALLOWED_SESSION_LIMITS)
  maxSessions?: number;

  @ApiPropertyOptional({ enum: CUSTOM_BEHAVIORS })
  @ValidateIf((dto: UpdateUserSessionPolicyDto) => dto.mode === 'CUSTOM')
  @IsIn(CUSTOM_BEHAVIORS)
  loginBehavior?: 'BLOCK' | 'REVOKE_OLDEST';
}

export class ConfirmSessionRevokeDto {
  @ApiProperty()
  @IsBoolean()
  confirm!: boolean;
}
