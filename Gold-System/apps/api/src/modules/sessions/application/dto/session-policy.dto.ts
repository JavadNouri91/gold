import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ALLOWED_SESSION_LIMITS } from '../../domain/session-policy';
import {
  IDLE_TIMEOUT_MAX_MINUTES,
  IDLE_TIMEOUT_MIN_MINUTES,
  MAX_SESSION_DURATION_MAX_MINUTES,
  MAX_SESSION_DURATION_MIN_MINUTES,
} from '../../domain/session-time-policy';

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

  @ApiPropertyOptional({
    nullable: true,
    description: 'Minutes without activity before logout. Null disables idle timeout.',
  })
  @IsOptional()
  @ValidateIf((dto: UpdateGlobalSessionPolicyDto) => dto.idleTimeoutMinutes != null)
  @IsInt()
  @Min(IDLE_TIMEOUT_MIN_MINUTES)
  @Max(IDLE_TIMEOUT_MAX_MINUTES)
  idleTimeoutMinutes?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Maximum session length from login in minutes. Null disables the cap.',
  })
  @IsOptional()
  @ValidateIf((dto: UpdateGlobalSessionPolicyDto) => dto.maxSessionDurationMinutes != null)
  @IsInt()
  @Min(MAX_SESSION_DURATION_MIN_MINUTES)
  @Max(MAX_SESSION_DURATION_MAX_MINUTES)
  maxSessionDurationMinutes?: number | null;
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
