import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser, CurrentUserData } from '../../../common/decorators/current-user.decorator';
import { ConfirmSessionRevokeDto } from '../application/dto/session-policy.dto';
import { SessionAdminService } from '../application/session-admin.service';
import {
  assertCanManageSessions,
  SessionEnforcementService,
} from '../application/session-enforcement.service';

@ApiTags('user-sessions')
@ApiBearerAuth()
@Controller({ path: 'users/:userId/sessions', version: '1' })
export class UserSessionsController {
  constructor(
    private readonly sessions: SessionEnforcementService,
    private readonly admin: SessionAdminService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List active sessions for a user' })
  list(@Param('userId') userId: string, @CurrentUser() actor: CurrentUserData) {
    this.assertCanView(actor, userId);
    const current = actor.userId === userId ? (actor.sessionId ?? null) : null;
    return this.admin.listUserSessions(userId, current);
  }

  @Post('revoke-others')
  @ApiOperation({ summary: 'Revoke every session except the current one' })
  revokeOthers(
    @Param('userId') userId: string,
    @Body() dto: ConfirmSessionRevokeDto,
    @CurrentUser() actor: CurrentUserData,
    @Req() req: Request,
  ) {
    const byAdmin = actor.userId !== userId;
    if (byAdmin) assertCanManageSessions(actor.permissions, 'user');
    return this.sessions.revokeOtherSessions({
      actorId: actor.userId,
      targetUserId: userId,
      keepSessionId: actor.userId === userId ? (actor.sessionId ?? null) : null,
      confirm: dto.confirm,
      ipAddress: req.ip,
    });
  }

  @Post(':sessionId/revoke')
  @ApiOperation({ summary: 'Revoke one session' })
  revoke(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: ConfirmSessionRevokeDto,
    @CurrentUser() actor: CurrentUserData,
    @Req() req: Request,
  ) {
    const byAdmin = actor.userId !== userId;
    if (byAdmin) assertCanManageSessions(actor.permissions, 'user');
    return this.sessions.revokeSession({
      actorId: actor.userId,
      targetUserId: userId,
      sessionId,
      currentSessionId: actor.userId === userId ? (actor.sessionId ?? null) : null,
      confirm: dto.confirm,
      byAdmin,
      ipAddress: req.ip,
    });
  }

  private assertCanView(actor: CurrentUserData, userId: string) {
    if (actor.userId === userId) return;
    assertCanManageSessions(actor.permissions, 'user');
  }
}
