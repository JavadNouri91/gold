import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { CustomersService } from '../../customers/application/customers.service';
import { AuthSecurityService, AUTH_ERROR } from './auth-security.service';
import { RegistrationDto } from './dto/customer-auth.dto';
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
import { toLatinDigits } from '../../../common/digits';

/**
 * Valid argon2id hash of a throwaway string.
 * Used only so unknown mobiles take the same verify() path as known users.
 * The plaintext is not a credential and is never accepted for login.
 */
const UNKNOWN_USER_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$+0lL24FCc0jVx48PdodfSw$cn3Ee1ijOK5tdjNvbbLlI3McBxzjRroOs2h2qp9Ftes';

const PASSWORD_RESET_REQUEST_MESSAGE =
  'اگر شماره موبایل در سامانه ثبت شده باشد، کد بازیابی پیامک می‌شود.';

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
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly security: AuthSecurityService,
  ) {}

  /**
   * Step 1: Validate credentials and send OTP
   */
  async initiateLogin(
    mobile: string,
    password: string,
    _ipAddress?: string,
    _userAgent?: string,
  ): Promise<
    | { message: string; requiresOtp: true }
    | (TokenPair & {
        message: string;
        requiresOtp: false;
        user: { id: string; mobile: string; roles: string[]; permissions: string[] };
      })
  > {
    const result = await this.usersService.findByMobileWithPassword(mobile);

    if (!result) {
      // Constant-time response to prevent user enumeration
      await argon2.verify(UNKNOWN_USER_PASSWORD_HASH, password);
      throw new UnauthorizedException(AUTH_ERROR);
    }

    const { user, passwordHash } = result;

    const passwordValid = await this.verifyExistingPassword(user.id, passwordHash, password);
    if (!user.isActive()) throw new UnauthorizedException(AUTH_ERROR);

    await this.security.assertAccount(user.id);
    if (!passwordValid) throw new UnauthorizedException(AUTH_ERROR);
    if (!this.requiresLoginOtp()) {
      return {
        ...(await this.completeLogin(user, _ipAddress, _userAgent)),
        message: 'ورود موفق بود.',
        requiresOtp: false,
      };
    }
    await this.sendChallenge(user.id, mobile, 'LOGIN');
    return { message: 'کد تأیید ارسال شد.', requiresOtp: true };
  }

  requiresLoginOtp(): boolean {
    return !(
      this.configService.get('app.nodeEnv') === 'development' &&
      this.configService.get('otp').loginBypass
    );
  }

  /**
   * Ask for a password-reset code by mobile.
   * The response is the same whether or not the number is registered.
   */
  async requestPasswordReset(mobile: string): Promise<{ message: string }> {
    const result = await this.usersService.findByMobileWithPassword(mobile);
    if (result?.user.isActive()) {
      try {
        await this.security.assertAccount(result.user.id);
      } catch {
        return { message: PASSWORD_RESET_REQUEST_MESSAGE };
      }
      await this.sendChallenge(result.user.id, mobile, 'PASSWORD_RESET');
    } else {
      await argon2.verify(UNKNOWN_USER_PASSWORD_HASH, 'password-reset');
    }
    return { message: PASSWORD_RESET_REQUEST_MESSAGE };
  }

  async verifyPasswordReset(mobile: string, otp: string) {
    const grant = randomBytes(32).toString('hex');
    const codeHash = await argon2.hash(grant);
    await this.otpRepository.consume(mobile, 'PASSWORD_RESET', otp, async (tx, row) => {
      if (!row.userId) throw new UnauthorizedException(AUTH_ERROR);
      await this.security.assertAccount(row.userId, tx);
      await tx.otpCode.updateMany({
        where: { mobile, purpose: 'RESET_GRANT', usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.otpCode.create({
        data: {
          mobile,
          userId: row.userId,
          purpose: 'RESET_GRANT',
          codeHash,
          expiresAt: new Date(Date.now() + 300_000),
        },
      });
    });
    return { resetGrant: grant };
  }

  /**
   * Set a new password after the mobile verification code is accepted.
   * Existing sessions are revoked so the old password cannot stay signed in.
   */
  async resetPassword(
    mobile: string,
    grant: string,
    password: string,
    confirmation = password,
  ): Promise<{ message: string }> {
    this.assertPassword(password, confirmation);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.otpRepository.consume(mobile, 'RESET_GRANT', grant, async (tx, row) => {
      if (!row.userId) throw new UnauthorizedException(AUTH_ERROR);
      await this.security.assertAccount(row.userId, tx);
      const customer = await tx.customer.findUnique({ where: { userId: row.userId } });
      if (customer?.nationalId === password)
        throw new BadRequestException('رمز عبور نباید کد ملی باشد.');
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash, mobileVerifiedAt: new Date() },
      });
      await tx.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.loginConfirmation.updateMany({
        where: { userId: row.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.otpCode.updateMany({
        where: { mobile, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: row.userId,
          action: 'PASSWORD_RESET',
          entityType: 'User',
          entityId: row.userId,
        },
      });
    });
    return { message: 'رمز عبور تغییر کرد. با رمز جدید وارد شوید.' };
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
    const userId = await this.otpRepository.consume(mobile, 'LOGIN', otp, async (tx, row) => {
      if (!row.userId) throw new UnauthorizedException(AUTH_ERROR);
      await this.security.assertAccount(row.userId, tx);
      await tx.user.update({ where: { id: row.userId }, data: { mobileVerifiedAt: new Date() } });
      return row.userId;
    });
    return this.completeLogin(await this.usersService.findById(userId), ipAddress, userAgent);
  }

  /**
   * Refresh access token using a valid refresh token
   */
  async refresh(
    refreshToken: string,
    ipAddress?: string,
  ): Promise<
    TokenPair & { user: { id: string; mobile: string; roles: string[]; permissions: string[] } }
  > {
    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await this.refreshTokenRepository.findByTokenHash(tokenHash);

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    await this.security.assertAccount(stored.userId);
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
      user: { id: user.id, mobile: user.mobile, roles: user.roles, permissions: user.permissions },
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
    await this.security.assertAccount(opened.userId);
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
    await this.security.assertAccount(opened.userId);
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

  private assertPassword(password: string, confirmation: string) {
    if (
      password !== confirmation ||
      password.length < 12 ||
      password.length > 128 ||
      !/\p{L}/u.test(password) ||
      !/\p{N}/u.test(password)
    ) {
      throw new BadRequestException(
        'رمز عبور باید ۱۲ تا ۱۲۸ نویسه و شامل حرف و عدد باشد و با تکرار آن یکسان باشد.',
      );
    }
  }

  private async verifyExistingPassword(
    userId: string | null,
    passwordHash: string | null,
    password: string,
  ): Promise<boolean> {
    const exact = await argon2.verify(passwordHash || UNKNOWN_USER_PASSWORD_HASH, password);
    if (exact) return !!passwordHash;
    // Only existing national-ID defaults retain the digit conversion used by older forms.
    // Customer-chosen passwords always require an exact match.
    const latin = toLatinDigits(password);
    if (!userId || !passwordHash || latin === password || !/^\d{10}$/.test(latin)) return false;
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
      select: { nationalId: true },
    });
    return customer?.nationalId === latin && (await argon2.verify(passwordHash, latin));
  }

  private async sendChallenge(
    userId: string | null,
    mobile: string,
    purpose: string,
    payload?: import('@prisma/client').Prisma.InputJsonValue,
  ) {
    const otp = generateNumericOtp(6);
    await this.otpRepository.createOrReplace({
      userId,
      mobile,
      purpose,
      code: otp,
      expiresAt: new Date(Date.now() + 120_000),
      payload,
    });
    try {
      await this.notificationService.sendOtp(userId, mobile, otp);
    } catch {
      await this.otpRepository.invalidate(mobile, purpose);
      this.logger.warn('Authentication SMS delivery failed');
      // Keep account existence private. The frontend never promises delivery.
    }
  }

  async initiateRegistration(dto: RegistrationDto) {
    this.assertPassword(dto.password, dto.confirmPassword);
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const exists = await this.usersService.findByMobile(dto.mobile);
    const customerExists = await this.prisma.customer.findUnique({
      where: { mobile: dto.mobile },
      select: { id: true },
    });
    if (!exists && !customerExists) {
      await this.sendChallenge(null, dto.mobile, 'REGISTRATION', {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        passwordHash,
      });
    }
    return { message: 'در صورت امکان ثبت‌نام، کد تأیید ارسال می‌شود.' };
  }

  async verifyRegistration(mobile: string, otp: string, ipAddress?: string, userAgent?: string) {
    const userId = await this.otpRepository.consume(
      mobile,
      'REGISTRATION',
      otp,
      async (tx, row) => {
        const data = row.payload as {
          firstName: string;
          lastName: string;
          passwordHash: string;
        } | null;
        if (
          !data ||
          (await tx.user.findUnique({ where: { mobile } })) ||
          (await tx.customer.findUnique({ where: { mobile } }))
        )
          throw new UnauthorizedException(AUTH_ERROR);
        const role = await tx.role.findUniqueOrThrow({ where: { name: 'customer' } });
        const user = await this.usersService.createCustomerUser(
          {
            name: `${data.firstName} ${data.lastName}`,
            mobile,
            passwordHash: data.passwordHash,
            mobileVerifiedAt: new Date(),
            roleId: role.id,
          },
          tx,
        );
        const customer = await this.customers.createCustomerProfile(
          tx,
          { firstName: data.firstName, lastName: data.lastName, mobile },
          user.id,
        );
        await tx.customerAccount.create({ data: { customerId: customer.id } });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: 'CUSTOMER_REGISTERED',
            entityType: 'Customer',
            entityId: customer.id,
            ipAddress,
          },
        });
        return user.id;
      },
    );
    return this.completeLogin(await this.usersService.findById(userId), ipAddress, userAgent);
  }

  private async customerForLogin(mobile: string) {
    const found = await this.usersService.findByMobileWithPassword(mobile);
    if (!found || found.user.roles.length !== 1 || found.user.roles[0] !== 'customer') return null;
    try {
      await this.security.assertAccount(found.user.id);
    } catch {
      return null;
    }
    return found;
  }

  async customerPasswordLogin(
    mobile: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const found = await this.customerForLogin(mobile);
    const valid = await this.verifyExistingPassword(
      found?.user.id ?? null,
      found?.passwordHash ?? null,
      password,
    );
    if (!found) throw new UnauthorizedException(AUTH_ERROR);
    if (!valid) throw new UnauthorizedException(AUTH_ERROR);
    return this.completeLogin(found.user, ipAddress, userAgent);
  }

  async requestCustomerOtp(mobile: string) {
    const found = await this.customerForLogin(mobile);
    if (found) await this.sendChallenge(found.user.id, mobile, 'CUSTOMER_LOGIN');
    return { message: 'اگر حساب مجاز باشد، کد تأیید ارسال می‌شود.' };
  }

  async verifyCustomerOtp(mobile: string, otp: string, ipAddress?: string, userAgent?: string) {
    const id = await this.otpRepository.consume(mobile, 'CUSTOMER_LOGIN', otp, async (tx, row) => {
      if (!row.userId) throw new UnauthorizedException(AUTH_ERROR);
      await this.security.assertAccount(row.userId, tx);
      const roles = await tx.userRole.findMany({
        where: { userId: row.userId },
        include: { role: true },
      });
      if (roles.length !== 1 || roles[0].role.name !== 'customer')
        throw new UnauthorizedException(AUTH_ERROR);
      await tx.user.update({ where: { id: row.userId }, data: { mobileVerifiedAt: new Date() } });
      return row.userId;
    });
    return this.completeLogin(await this.usersService.findById(id), ipAddress, userAgent);
  }

  private async completeLogin(
    user: { id: string; mobile: string; roles: string[]; permissions: string[] },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<
    TokenPair & {
      user: { id: string; mobile: string; roles: string[]; permissions: string[] };
    }
  > {
    await this.security.assertAccount(user.id);
    const tokenPair = await this.issueLoginSession(
      user.id,
      user.mobile,
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
