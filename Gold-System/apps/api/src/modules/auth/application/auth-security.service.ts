import {
  HttpException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { Optional } from '@nestjs/common';
import { SmsSettingsService } from '../../sms/application/sms-settings.service';

export const AUTH_ERROR = 'اطلاعات ورود یا کد تأیید معتبر نیست یا منقضی شده است.';

@Injectable()
export class AuthSecurityService implements OnModuleInit, OnModuleDestroy {
  private cleanup?: ReturnType<typeof setInterval>;
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly smsSettings?: SmsSettingsService,
  ) {}

  onModuleInit() {
    this.cleanup = setInterval(() => {
      void this.prisma
        .$transaction([
          this.prisma.otpCode.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
          this.prisma.authRateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
        ])
        .catch(() => undefined);
    }, 600_000);
    this.cleanup.unref();
  }
  onModuleDestroy() {
    if (this.cleanup) clearInterval(this.cleanup);
  }

  async limit(mobile: string, ip: string, action: 'send' | 'password', userId?: string) {
    if (!userId)
      userId = (await this.prisma.user.findUnique({ where: { mobile }, select: { id: true } }))?.id;
    const otpPolicy = action === 'send' ? await this.smsSettings?.getOtpPolicy() : undefined;
    const cooldownMs = (otpPolicy?.resendCooldownSeconds ?? 60) * 1000;
    const now = Date.now();
    const rules: Array<[string, number, number]> =
      action === 'send'
        ? [
            [`sms:cooldown:${mobile}`, 1, cooldownMs],
            [`sms:mobile:${mobile}`, 5, 3_600_000],
            [`sms:ip:${ip}`, 20, 3_600_000],
            ...(userId ? [[`sms:user:${userId}`, 5, 3_600_000] as [string, number, number]] : []),
          ]
        : [
            [`password:mobile:${mobile}`, 10, 900_000],
            [`password:ip:${ip}`, 50, 900_000],
          ];
    const allowed = await this.prisma.$transaction(async (tx) => {
      // Stable ordering avoids deadlocks when mobile and IP limits overlap.
      const counts: boolean[] = [];
      for (const [key, maximum, ttl] of rules.sort(([a], [b]) => a.localeCompare(b))) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
        const row = await tx.authRateLimit.findUnique({ where: { key } });
        const expired = !row || row.expiresAt.getTime() <= now;
        const count = expired ? 1 : row.count + 1;
        await tx.authRateLimit.upsert({
          where: { key },
          create: { key, count, expiresAt: new Date(now + ttl) },
          update: { count, ...(expired ? { expiresAt: new Date(now + ttl) } : {}) },
        });
        counts.push(count <= maximum);
      }
      return counts.every(Boolean);
    });
    if (!allowed)
      throw new HttpException('تعداد تلاش‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.', 429);
  }

  async assertAccount(userId: string, tx: Prisma.TransactionClient = this.prisma) {
    const user = await tx.user.findUnique({ where: { id: userId }, include: { customer: true } });
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      (user.customer &&
        (['SUSPENDED', 'BLOCKED'].includes(user.customer.status) ||
          user.customer.accountStatus === 'BLOCKED'))
    ) {
      throw new UnauthorizedException(AUTH_ERROR);
    }
    return user;
  }
}
