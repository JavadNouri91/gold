import { Body, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser, CurrentUserData } from '../../../common/decorators/current-user.decorator';
import { SessionAdminService } from '../application/session-admin.service';
import {
  UpdateGlobalSessionPolicyDto,
  UpdateRoleSessionPolicyDto,
  UpdateUserSessionPolicyDto,
} from '../application/dto/session-policy.dto';
import { assertCanManageSessions } from '../application/session-enforcement.service';

@ApiTags('session-policies')
@ApiBearerAuth()
@Controller({ path: 'session-policies', version: '1' })
export class SessionPoliciesController {
  constructor(private readonly admin: SessionAdminService) {}

  @Get('global')
  @RequirePermissions('session.policy.manage')
  @ApiOperation({ summary: 'Read the global default session policy' })
  getGlobal() {
    return this.admin.getGlobal();
  }

  @Patch('global')
  @RequirePermissions('session.policy.manage')
  @ApiOperation({ summary: 'Update the global default session policy' })
  updateGlobal(
    @Body() dto: UpdateGlobalSessionPolicyDto,
    @CurrentUser() actor: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.admin.updateGlobal(dto, actor.userId, req.ip);
  }

  @Get('roles')
  @RequirePermissions('session.policy.manage')
  @ApiOperation({ summary: 'List session policies for every role' })
  listRoles() {
    return this.admin.listRolePolicies();
  }

  @Patch('roles/:roleId')
  @RequirePermissions('session.policy.manage')
  @ApiOperation({ summary: 'Update one role session policy' })
  updateRole(
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleSessionPolicyDto,
    @CurrentUser() actor: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.admin.updateRolePolicy(roleId, dto, actor.userId, req.ip);
  }

  @Get('users/search')
  @ApiOperation({ summary: 'Find users when editing a session override' })
  searchUsers(@CurrentUser() actor: CurrentUserData, @Query('mobile') mobile = '') {
    assertCanManageSessions(actor.permissions, 'user');
    return this.admin.searchUsers(mobile);
  }

  @Get('users/:userId')
  @ApiOperation({ summary: 'Read a user session override and the effective policy' })
  getUser(@Param('userId') userId: string, @CurrentUser() actor: CurrentUserData) {
    assertCanManageSessions(actor.permissions, 'user');
    return this.admin.getUserPolicy(userId);
  }

  @Patch('users/:userId')
  @ApiOperation({ summary: 'Set or clear a user session override' })
  updateUser(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserSessionPolicyDto,
    @CurrentUser() actor: CurrentUserData,
    @Req() req: Request,
  ) {
    assertCanManageSessions(actor.permissions, 'user');
    return this.admin.updateUserPolicy(userId, dto, actor.userId, req.ip);
  }
}
