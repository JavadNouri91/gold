import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { UsersService } from '../../users/application/users.service';
import { AuditService } from '../../audit/application/audit.service';
import { OtpRepository } from '../infrastructure/repositories/otp.repository';
import { RefreshTokenRepository } from '../infrastructure/repositories/refresh-token.repository';
import { NotificationService } from '../../notifications/application/notification.service';
import { SessionEnforcementService } from '../../sessions/application/session-enforcement.service';
import { hashRefreshToken } from '../domain/refresh-token.hash';
import { generateNumericOtp } from '../domain/otp-generator';
import { JwtPayload, TokenPair } from '@gold/shared-types';
import { BusinessRuleException } from '../../../common/exceptions/business-rule.exception';

/**
 * Valid argon2id hash of a throwaway string.
 * Used only so unknown mobiles take the same verify() path as known users.
 * The plaintext is not a credential and is never accepted for login.
 */
const UNKNOWN_USER_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$+0lL24FCc0jVx48PdodfSw$cn3Ee1ijOK5tdjNvbbLlI3McBxzjRroOs2h2qp9Ftes';

/**
 * Auth Service
 *
 * Flow (docs/21-business-decisions.md §11.1):
 * 1. User submits mobile + password → credentials validated
 * 2. If valid, OTP sent via SMS
 * 3. User submits OTP → if valid, token pair issued
 *
 * OTP required for ALL users (both staff and customers).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly otpRepository: OtpRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    private readonly sessions: SessionEnforcementService,
  ) {}

  /**
   * Step 1: Validate credentials and send OTP
   */
  async initiateLogin(mobile: string, password: string): Promise<{ message: string }> {
    const result = await this.usersService.findByMobileWithPassword(mobile);

    if (!result) {
      // Constant-time response to prevent user enumeration
      await argon2.verify(UNKNOWN_USER_PASSWORD_HASH, password);
      throw new UnauthorizedException('Invalid credentials');
    }

    const { user, passwordHash } = result;

    if (!user.isActive()) {
      throw new BusinessRuleException(
        'USER_INACTIVE',
        'Your account is not active. Please contact support.',
      );
    }

    if (!passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await argon2.verify(passwordHash, password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate and send OTP
    const otpConfig = this.configService.get('otp');
    const otp = generateNumericOtp(otpConfig.length);
    const expiresAt = new Date(Date.now() + otpConfig.expiresInSeconds * 1000);

    await this.otpRepository.createOrReplace({
      userId: user.id,
      mobile,
      code: otp,
      purpose: 'LOGIN',
      expiresAt,
    });

    // Deliver OTP via NotificationService → SMS provider
    // SECURITY: OTP plaintext is passed to sendOtp() which calls the SMS provider.
    // The DB stores only the argon2 hash. The mock provider logs in dev/test only.
    try {
      await this.notificationService.sendOtp(user.id, mobile, otp);
    } catch (err: unknown) {
      // Notification failure MUST NOT block login flow
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[AuthService] OTP SMS delivery failed for mobile=${mobile}: ${msg}`);
    }

    return { message: 'OTP sent to your registered mobile number' };
  }

  /**
   * Step 2: Verify OTP and issue token pair
   */
  async verifyOtp(
    mobile: string,
    otp: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<
    TokenPair & {
      user: { id: string; mobile: string; roles: string[]; permissions: string[] };
    }
  > {
    const otpRecord = await this.otpRepository.findActive(mobile, 'LOGIN');

    if (!otpRecord) {
      throw new UnauthorizedException('OTP expired or not found. Please request a new one.');
    }

    const otpConfig = this.configService.get('otp');

    if (otpRecord.attempts >= otpConfig.maxAttempts) {
      throw new BusinessRuleException(
        'OTP_MAX_ATTEMPTS',
        'Maximum OTP attempts exceeded. Please request a new OTP.',
      );
    }

    await this.otpRepository.incrementAttempts(otpRecord.id);

    // Verify OTP using argon2 — constant-time comparison; never plaintext equality
    const isValid = await this.otpRepository.verifyCode(otpRecord, otp);
    if (!isValid) {
      throw new UnauthorizedException('Invalid OTP');
    }

    await this.otpRepository.markUsed(otpRecord.id);

    const user = await this.usersService.findByMobile(mobile);
    if (!user) throw new UnauthorizedException('User not found');

    const tokenPair = await this.issueLoginSession(
      user.id,
      mobile,
      user.roles,
      user.permissions,
      ipAddress,
      userAgent,
    );

    await this.usersService.updateLastLogin(user.id);

    await this.auditService.log({
      actorId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress,
    });

    await this.auditService.log({
      actorId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress,
    });

    return {
      ...tokenPair,
      user: {
        id: user.id,
        mobile: user.mobile,
        roles: user.roles,
        permissions: user.permissions,
      },
    };
  }

  /**
   * Refresh access token using a valid refresh token
   */
  async refresh(refreshToken: string, ipAddress?: string): Promise<TokenPair> {
    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await this.refreshTokenRepository.findByTokenHash(tokenHash);

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    const user = await this.usersService.findById(stored.userId);
    const jwtConfig = this.configService.get('jwt');
    const refreshExpiresAt = this.parseExpiry(jwtConfig.refreshExpiresIn);
    const rotated = await this.sessions.rotateRefreshToken({
      sessionId: stored.id,
      userId: stored.userId,
      expiresAt: refreshExpiresAt,
      ipAddress: ipAddress ?? null,
    });
    const accessToken = this.signAccessToken(
      user.id,
      user.mobile,
      user.roles,
      user.permissions,
      stored.id,
    );
    return {
      accessToken,
      refreshToken: rotated,
      expiresIn: this.parseExpirySeconds(jwtConfig.accessExpiresIn),
    };
  }

  async confirmSessionLogin(
    confirmationToken: string,
    revokeSessionId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<
    TokenPair & {
      user: { id: string; mobile: string; roles: string[]; permissions: string[] };
    }
  > {
    const jwtConfig = this.configService.get('jwt');
    const opened = await this.sessions.confirmLoginSession({
      confirmationToken,
      revokeSessionId,
      expiresAt: this.parseExpiry(jwtConfig.refreshExpiresIn),
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
    const user = await this.usersService.findById(opened.userId);
    const accessToken = this.signAccessToken(
      user.id,
      user.mobile,
      user.roles,
      user.permissions,
      opened.sessionId,
    );
    await this.usersService.updateLastLogin(user.id);
    await this.auditService.log({
      actorId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress,
    });
    await this.auditService.log({
      actorId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress,
    });
    return {
      accessToken,
      refreshToken: opened.refreshToken,
      expiresIn: this.parseExpirySeconds(jwtConfig.accessExpiresIn),
      user: {
        id: user.id,
        mobile: user.mobile,
        roles: user.roles,
        permissions: user.permissions,
      },
    };
  }

  async closeOtherSessionsAndLogin(
    confirmationToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<
    TokenPair & {
      user: { id: string; mobile: string; roles: string[]; permissions: string[] };
    }
  > {
    const jwtConfig = this.configService.get('jwt');
    const opened = await this.sessions.confirmLoginByClosingOthers({
      confirmationToken,
      expiresAt: this.parseExpiry(jwtConfig.refreshExpiresIn),
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
    const user = await this.usersService.findById(opened.userId);
    const accessToken = this.signAccessToken(
      user.id,
      user.mobile,
      user.roles,
      user.permissions,
      opened.sessionId,
    );
    await this.usersService.updateLastLogin(user.id);
    await this.auditService.log({
      actorId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress,
    });
    await this.auditService.log({
      actorId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress,
    });
    return {
      accessToken,
      refreshToken: opened.refreshToken,
      expiresIn: this.parseExpirySeconds(jwtConfig.accessExpiresIn),
      user: {
        id: user.id,
        mobile: user.mobile,
        roles: user.roles,
        permissions: user.permissions,
      },
    };
  }

  /** Active refresh-token sessions for the signed-in user. Token hashes are never returned. */
  async listSessions(userId: string, currentSessionId?: string | null) {
    return this.sessions.listForUser(userId, currentSessionId ?? null);
  }

  revokeOwnSession(input: {
    userId: string;
    sessionId: string;
    currentSessionId: string | null;
    confirm: boolean;
    ipAddress?: string;
  }) {
    return this.sessions.revokeSession({
      actorId: input.userId,
      targetUserId: input.userId,
      sessionId: input.sessionId,
      currentSessionId: input.currentSessionId,
      confirm: input.confirm,
      byAdmin: false,
      ipAddress: input.ipAddress,
    });
  }

  revokeOtherOwnSessions(input: {
    userId: string;
    currentSessionId: string | null;
    confirm: boolean;
    ipAddress?: string;
  }) {
    return this.sessions.revokeOtherSessions({
      actorId: input.userId,
      targetUserId: input.userId,
      keepSessionId: input.currentSessionId,
      confirm: input.confirm,
      ipAddress: input.ipAddress,
    });
  }

  /**
   * Revoke refresh token (logout)
   */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await this.refreshTokenRepository.findByTokenHash(tokenHash);
    if (stored && !stored.revokedAt) {
      await this.refreshTokenRepository.revoke(stored.id);
      await this.auditService.log({
        actorId: stored.userId,
        action: 'SESSION_REVOKED',
        entityType: 'Session',
        entityId: stored.id,
        reason: 'logout',
      });
    }
  }

  // ─── Private helpers ───────────────────────────────────────

  private async issueLoginSession(
    userId: string,
    mobile: string,
    roles: string[],
    permissions: string[],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    const jwtConfig = this.configService.get('jwt');
    const opened = await this.sessions.openLoginSession({
      userId,
      expiresAt: this.parseExpiry(jwtConfig.refreshExpiresIn),
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
    const accessToken = this.signAccessToken(userId, mobile, roles, permissions, opened.sessionId);
    return {
      accessToken,
      refreshToken: opened.refreshToken,
      expiresIn: this.parseExpirySeconds(jwtConfig.accessExpiresIn),
    };
  }

  private signAccessToken(
    userId: string,
    mobile: string,
    roles: string[],
    permissions: string[],
    sessionId: string,
  ): string {
    const payload: JwtPayload = { sub: userId, mobile, roles, permissions, sid: sessionId };
    const jwtConfig = this.configService.get('jwt');
    return this.jwtService.sign(payload, {
      secret: jwtConfig.accessSecret,
      expiresIn: jwtConfig.accessExpiresIn,
    });
  }

  private parseExpiry(expiry: string): Date {
    const ms = this.parseExpiryMs(expiry);
    return new Date(Date.now() + ms);
  }

  private parseExpiryMs(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) throw new Error(`Invalid expiry format: ${expiry}`);
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return value * multipliers[unit];
  }

  private parseExpirySeconds(expiry: string): number {
    return Math.floor(this.parseExpiryMs(expiry) / 1000);
  }
}
