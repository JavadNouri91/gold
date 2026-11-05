import { Res, UnauthorizedException, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import {
  AuthCookieInterceptor,
  readRefreshCookie,
  REFRESH_COOKIE,
  refreshCookieOptions,
} from '../auth-cookie.interceptor';
import { AuthSecurityService } from '../../application/auth-security.service';
import {
  RegistrationDto,
  CustomerPasswordDto,
  CustomerOtpDto,
  MobileDto,
  CompleteResetDto,
} from '../../application/dto/customer-auth.dto';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from '../../application/auth.service';
import {
  InitiateLoginDto,
  RequestPasswordResetDto,
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
@UseInterceptors(AuthCookieInterceptor)
@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly security: AuthSecurityService,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 1: Submit credentials and receive OTP via SMS' })
  async initiateLogin(@Body() dto: InitiateLoginDto, @Req() req: Request) {
    await this.security.limit(dto.mobile, req.ip || 'unknown', 'password');
    if (this.authService.requiresLoginOtp()) {
      await this.security.limit(dto.mobile, req.ip || 'unknown', 'send');
    }
    return this.authService.initiateLogin(
      dto.mobile,
      dto.password,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a password-reset code to a registered mobile' })
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto, @Req() req: Request) {
    await this.security.limit(dto.mobile, req.ip || 'unknown', 'send');
    return this.authService.requestPasswordReset(dto.mobile);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password after verifying the mobile code' })
  resetPassword(@Body() dto: CompleteResetDto) {
    return this.authService.resetPassword(
      dto.mobile,
      dto.resetGrant,
      dto.password,
      dto.confirmPassword,
    );
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
  refresh(@Req() req: Request) {
    const token = readRefreshCookie(req);
    if (!token) throw new UnauthorizedException('نشست معتبر نیست.');
    return this.authService.refresh(token, req.ip);
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
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readRefreshCookie(req);
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    if (token) await this.authService.logout(token);
    return { revoked: true };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  async register(@Body() dto: RegistrationDto, @Req() req: Request) {
    await this.security.limit(dto.mobile, req.ip || 'unknown', 'send');
    return this.authService.initiateRegistration(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register/verify')
  verifyRegistration(@Body() dto: CustomerOtpDto, @Req() req: Request) {
    return this.authService.verifyRegistration(
      dto.mobile,
      dto.otp,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('customer/password')
  async customerPassword(@Body() dto: CustomerPasswordDto, @Req() req: Request) {
    await this.security.limit(dto.mobile, req.ip || 'unknown', 'password');
    return this.authService.customerPasswordLogin(
      dto.mobile,
      dto.password,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('customer/otp/request')
  async requestCustomerOtp(@Body() dto: MobileDto, @Req() req: Request) {
    await this.security.limit(dto.mobile, req.ip || 'unknown', 'send');
    return this.authService.requestCustomerOtp(dto.mobile);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('customer/otp/verify')
  verifyCustomerOtp(@Body() dto: CustomerOtpDto, @Req() req: Request) {
    return this.authService.verifyCustomerOtp(
      dto.mobile,
      dto.otp,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('password/verify')
  verifyPasswordReset(@Body() dto: CustomerOtpDto) {
    return this.authService.verifyPasswordReset(dto.mobile, dto.otp);
  }
}
