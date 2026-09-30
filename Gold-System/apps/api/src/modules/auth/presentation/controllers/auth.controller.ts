import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from '../../application/auth.service';
import {
  InitiateLoginDto,
  LogoutDto,
  RefreshTokenDto,
  VerifyOtpDto,
} from '../../application/dto/login.dto';
import {
  CloseOtherSessionsLoginDto,
  ConfirmLoginSessionDto,
} from '../../../sessions/application/dto/confirm-login-session.dto';
import { ConfirmSessionRevokeDto } from '../../../sessions/application/dto/session-policy.dto';
import { Public } from '../../../../common/decorators/public.decorator';
import { CurrentUser, CurrentUserData } from '../../../../common/decorators/current-user.decorator';

/** Credential and OTP endpoints are public and tightly rate-limited. */
const AUTH_THROTTLE = { short: { limit: 5, ttl: 60_000 }, long: { limit: 10, ttl: 60_000 } };

/**
 * Auth Controller
 *
 * Two-step login flow (docs/21-business-decisions.md §11.1):
 * POST /auth/login    → validate credentials + send OTP
 * POST /auth/otp      → verify OTP + issue token pair
 * POST /auth/refresh  → rotate refresh token
 * POST /auth/logout   → revoke refresh token
 */
@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 1: Submit credentials and receive OTP via SMS' })
  initiateLogin(@Body() dto: InitiateLoginDto) {
    return this.authService.initiateLogin(dto.mobile, dto.password);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 2: Verify OTP and receive access + refresh tokens' })
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.authService.verifyOtp(dto.mobile, dto.otp, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('session-confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Finish login by revoking a chosen session when confirmation is required',
  })
  confirmSession(@Body() dto: ConfirmLoginSessionDto, @Req() req: Request) {
    return this.authService.confirmSessionLogin(
      dto.confirmationToken,
      dto.revokeSessionId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('session-confirm/close-others')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Finish a blocked login by closing every other active session',
  })
  closeOtherSessions(@Body() dto: CloseOtherSessionsLoginDto, @Req() req: Request) {
    return this.authService.closeOtherSessionsAndLogin(
      dto.confirmationToken,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and get new access token' })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.authService.refresh(dto.refreshToken, req.ip);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions for the signed-in user' })
  listSessions(@CurrentUser() user: CurrentUserData) {
    return this.authService.listSessions(user.userId, user.sessionId);
  }

  @Post('sessions/revoke-others')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke every session except the current one' })
  revokeOtherSessions(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ConfirmSessionRevokeDto,
    @Req() req: Request,
  ) {
    return this.authService.revokeOtherOwnSessions({
      userId: user.userId,
      currentSessionId: user.sessionId ?? null,
      confirm: dto.confirm,
      ipAddress: req.ip,
    });
  }

  @Post('sessions/:sessionId/revoke')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke one of the signed-in user sessions' })
  revokeSession(
    @CurrentUser() user: CurrentUserData,
    @Param('sessionId') sessionId: string,
    @Body() dto: ConfirmSessionRevokeDto,
    @Req() req: Request,
  ) {
    return this.authService.revokeOwnSession({
      userId: user.userId,
      sessionId,
      currentSessionId: user.sessionId ?? null,
      confirm: dto.confirm,
      ipAddress: req.ip,
    });
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke refresh token (logout)' })
  logout(@Body() dto: LogoutDto) {
    if (!dto.refreshToken) return { revoked: false };
    return this.authService.logout(dto.refreshToken).then(() => ({ revoked: true }));
  }
}
