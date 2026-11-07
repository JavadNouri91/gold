import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isIP } from 'node:net';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { decryptSmsSecret, encryptSmsSecret } from '../../../common/crypto/secret-box';
import {
  SMS_PROVIDER_NAMES,
  SmsProviderName,
  SmsRuntimeConfig,
} from '../infrastructure/providers/sms-provider.interface';

export const SMS_SETTING_ID = 'global';

export interface SmsSettingsInput {
  provider: SmsProviderName;
  apiBaseUrl?: string;
  username?: string;
  password?: string;
  originator?: string;
  otpTemplate?: string;
  enabled?: boolean;
  otpExpiresInSeconds?: number;
  otpResendCooldownSeconds?: number;
  otpMaxAttempts?: number;
  otpMaxPerHour?: number;
  // Kept for existing SMS.ir and Melipayamak deployments.
  apiKey?: string;
  senderLine?: string;
  smsirBaseUrl?: string;
  melipayamakBaseUrl?: string;
  melipayamakPassword?: string;
}

export interface SmsSettingsView {
  provider: SmsProviderName;
  apiBaseUrl: string;
  username: string;
  passwordConfigured: boolean;
  originator: string;
  otpTemplate: string;
  enabled: boolean;
  otpExpiresInSeconds: number;
  otpResendCooldownSeconds: number;
  otpMaxAttempts: number;
  otpMaxPerHour: number;
  connectionStatus: 'connected' | 'disconnected' | 'untested' | 'incomplete';
  connectionTestedAt: string | null;
  connectionTestMessage: string | null;
  // Legacy configuration fields remain available to existing panel integrations.
  senderLine: string;
  smsirBaseUrl: string;
  melipayamakBaseUrl: string;
  apiKeyConfigured: boolean;
  melipayamakPasswordConfigured: boolean;
  storedInDatabase: boolean;
  updatedAt: string | null;
  updatedById: string | null;
}

interface SmsEnvConfig {
  provider?: string;
  apiKey?: string;
  senderLine?: string;
  smsirBaseUrl?: string;
  melipayamakBaseUrl?: string;
  melipayamakPassword?: string;
}

@Injectable()
export class SmsSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async getView(): Promise<SmsSettingsView> {
    const row = await this.prisma.smsSetting.findUnique({ where: { id: SMS_SETTING_ID } });
    const config = await this.resolveEffectiveConfig();
    const complete =
      config.provider !== 'hisms' ||
      Boolean(config.apiBaseUrl && config.username && config.password);
    const connectionStatus = !complete
      ? 'incomplete'
      : row?.connectionTestedAt
        ? row.connectionTestSuccess
          ? 'connected'
          : 'disconnected'
        : 'untested';
    return {
      provider: config.provider,
      apiBaseUrl: config.apiBaseUrl ?? '',
      username: config.username ?? 'CSkkrm',
      passwordConfigured: Boolean(row?.passwordEncrypted || config.password),
      originator: config.originator ?? config.senderLine,
      otpTemplate: config.otpTemplate ?? '',
      enabled: config.enabled ?? false,
      otpExpiresInSeconds: config.otpExpiresInSeconds ?? 120,
      otpResendCooldownSeconds: config.otpResendCooldownSeconds ?? 60,
      otpMaxAttempts: config.otpMaxAttempts ?? 5,
      otpMaxPerHour: config.otpMaxPerHour ?? 5,
      connectionStatus,
      connectionTestedAt: row?.connectionTestedAt?.toISOString() ?? null,
      connectionTestMessage: row?.connectionTestMessage ?? null,
      senderLine: config.senderLine,
      smsirBaseUrl: config.smsirBaseUrl,
      melipayamakBaseUrl: config.melipayamakBaseUrl,
      apiKeyConfigured: Boolean(config.apiKey),
      melipayamakPasswordConfigured: Boolean(config.melipayamakPassword),
      storedInDatabase: Boolean(row),
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedById: row?.updatedById ?? null,
    };
  }

  async resolveEffectiveConfig(): Promise<SmsRuntimeConfig> {
    const row = await this.prisma.smsSetting.findUnique({ where: { id: SMS_SETTING_ID } });
    const env = (this.configService.get('sms') as SmsEnvConfig | undefined) ?? {};
    const provider = this.normalizeProvider(
      row?.provider ?? (env.provider && env.provider !== 'mock' ? env.provider : 'hisms'),
    );
    const legacyPassword = row?.melipayamakPasswordEncrypted
      ? this.decryptPassword(row.melipayamakPasswordEncrypted)
      : '';
    return {
      provider,
      apiKey: this.decryptPassword(row?.apiKeyEncrypted) || env.apiKey || '',
      senderLine: row?.senderLine || env.senderLine || (provider === 'hisms' ? '50004597' : ''),
      originator: row?.senderLine || '50004597',
      smsirBaseUrl: row?.smsirBaseUrl || env.smsirBaseUrl || 'https://api.sms.ir/v1',
      melipayamakBaseUrl:
        row?.melipayamakBaseUrl ||
        env.melipayamakBaseUrl ||
        'https://rest.payamak-panel.com/api/SendSMS',
      melipayamakPassword: legacyPassword || env.melipayamakPassword || '',
      apiBaseUrl: row?.apiBaseUrl ?? '',
      username: row?.username ?? 'CSkkrm',
      password: this.decryptPassword(row?.passwordEncrypted),
      otpTemplate: row?.otpTemplate ?? '',
      enabled: row ? row.enabled : provider !== 'hisms',
      otpExpiresInSeconds: row?.otpExpiresInSeconds ?? 120,
      otpResendCooldownSeconds: row?.otpResendCooldownSeconds ?? 60,
      otpMaxAttempts: row?.otpMaxAttempts ?? 5,
      otpMaxPerHour: 5,
    };
  }

  async getOtpPolicy() {
    const row = await this.prisma.smsSetting.findUnique({ where: { id: SMS_SETTING_ID } });
    return {
      expiresInSeconds: row?.otpExpiresInSeconds ?? 120,
      resendCooldownSeconds: row?.otpResendCooldownSeconds ?? 60,
      maxAttempts: row?.otpMaxAttempts ?? 5,
      maxSendsPerHour: 5,
    };
  }

  async update(
    input: SmsSettingsInput,
    actorId: string,
    ipAddress?: string,
  ): Promise<SmsSettingsView> {
    const provider = this.normalizeProvider(input.provider);
    if (provider === 'mock' && process.env.NODE_ENV === 'production')
      throw new BadRequestException(
        'در محیط عملیاتی نمی‌توان ارائه‌دهنده پیامک را روی حالت آزمایشی قرار داد.',
      );
    const apiBaseUrl =
      input.apiBaseUrl === undefined ? undefined : validateApiBaseUrl(input.apiBaseUrl);
    const originator =
      input.originator === undefined
        ? undefined
        : cleanDigits(input.originator, 'شماره خط ارسال‌کننده');
    const senderLine =
      input.senderLine === undefined
        ? undefined
        : cleanDigits(input.senderLine, 'شماره خط ارسال‌کننده');
    const existing = await this.prisma.smsSetting.findUnique({ where: { id: SMS_SETTING_ID } });
    const expiry = safeInt(
      input.otpExpiresInSeconds,
      existing?.otpExpiresInSeconds ?? 120,
      30,
      900,
      'زمان اعتبار کد',
    );
    const cooldown = safeInt(
      input.otpResendCooldownSeconds,
      existing?.otpResendCooldownSeconds ?? 60,
      30,
      3600,
      'زمان انتظار ارسال مجدد',
    );
    const attempts = safeInt(
      input.otpMaxAttempts,
      existing?.otpMaxAttempts ?? 5,
      1,
      5,
      'تعداد تلاش ناموفق',
    );
    if (input.enabled !== undefined && typeof input.enabled !== 'boolean')
      throw new BadRequestException('وضعیت فعال‌سازی معتبر نیست.');

    const before = await this.getView();
    let passwordEncrypted = existing?.passwordEncrypted ?? null;
    if (input.password !== undefined) {
      const password = input.password.trim();
      passwordEncrypted = password ? encryptForStorage(password) : null;
    } else if (passwordEncrypted?.startsWith('v1:')) {
      const legacy = decryptSmsSecret(passwordEncrypted).value;
      passwordEncrypted = legacy ? encryptForStorage(legacy) : null;
    }
    const oldApiKey =
      input.apiKey === undefined
        ? preserveEncrypted(existing?.apiKeyEncrypted)
        : encryptLegacyOrClear(input.apiKey);
    const oldMeliPassword =
      input.melipayamakPassword === undefined
        ? preserveEncrypted(existing?.melipayamakPasswordEncrypted)
        : encryptLegacyOrClear(input.melipayamakPassword);

    await this.invalidateCustomTextVerification();
    await this.prisma.smsSetting.upsert({
      where: { id: SMS_SETTING_ID },
      create: {
        id: SMS_SETTING_ID,
        provider,
        apiBaseUrl: apiBaseUrl ?? null,
        username: input.username?.trim() || 'CSkkrm',
        passwordEncrypted,
        senderLine: senderLine ?? originator ?? (provider === 'hisms' ? '50004597' : null),
        otpTemplate: input.otpTemplate?.trim() || null,
        enabled: input.enabled ?? false,
        otpExpiresInSeconds: expiry,
        otpResendCooldownSeconds: cooldown,
        otpMaxAttempts: attempts,
        apiKeyEncrypted: oldApiKey,
        melipayamakPasswordEncrypted: oldMeliPassword,
        smsirBaseUrl: input.smsirBaseUrl ?? null,
        melipayamakBaseUrl: input.melipayamakBaseUrl ?? null,
        updatedById: actorId,
      },
      update: {
        provider,
        ...(apiBaseUrl !== undefined ? { apiBaseUrl } : {}),
        ...(input.username !== undefined ? { username: input.username.trim() } : {}),
        passwordEncrypted,
        ...(senderLine !== undefined || originator !== undefined
          ? { senderLine: senderLine ?? originator }
          : {}),
        ...(input.otpTemplate !== undefined
          ? { otpTemplate: input.otpTemplate.trim() || null }
          : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        otpExpiresInSeconds: expiry,
        otpResendCooldownSeconds: cooldown,
        otpMaxAttempts: attempts,
        apiKeyEncrypted: oldApiKey,
        melipayamakPasswordEncrypted: oldMeliPassword,
        ...(input.smsirBaseUrl !== undefined ? { smsirBaseUrl: input.smsirBaseUrl } : {}),
        ...(input.melipayamakBaseUrl !== undefined
          ? { melipayamakBaseUrl: input.melipayamakBaseUrl }
          : {}),
        connectionTestedAt: null,
        connectionTestSuccess: null,
        connectionTestMessage: null,
        updatedById: actorId,
      },
    });
    const after = await this.getView();
    await this.audit.log({
      actorId,
      action: 'SMS_SETTINGS_CHANGED',
      entityType: 'SmsSetting',
      entityId: SMS_SETTING_ID,
      ipAddress,
      before: auditView(before),
      after: auditView(after),
    });
    return after;
  }

  async recordConnectionTest(
    actorId: string,
    ipAddress: string | undefined,
    result: { success: boolean; message: string },
  ) {
    await this.prisma.smsSetting.upsert({
      where: { id: SMS_SETTING_ID },
      create: {
        id: SMS_SETTING_ID,
        provider: 'hisms',
        username: 'CSkkrm',
        senderLine: '50004597',
        enabled: false,
        connectionTestedAt: new Date(),
        connectionTestSuccess: result.success,
        connectionTestMessage: result.message,
        updatedById: actorId,
      },
      update: {
        connectionTestedAt: new Date(),
        connectionTestSuccess: result.success,
        connectionTestMessage: result.message,
      },
    });
    await this.audit.log({
      actorId,
      action: 'SMS_CONNECTION_TEST',
      entityType: 'SmsSetting',
      entityId: SMS_SETTING_ID,
      ipAddress,
      after: { success: result.success, message: result.message },
    });
  }

  async resetToEnv(actorId: string, ipAddress?: string): Promise<SmsSettingsView> {
    const before = await this.getView();
    await this.prisma.smsSetting.deleteMany({ where: { id: SMS_SETTING_ID } });
    await this.invalidateCustomTextVerification();
    const after = await this.getView();
    await this.audit.log({
      actorId,
      action: 'SMS_SETTINGS_RESET',
      entityType: 'SmsSetting',
      entityId: SMS_SETTING_ID,
      ipAddress,
      before: auditView(before),
      after: auditView(after),
    });
    return after;
  }

  private async invalidateCustomTextVerification() {
    if (this.prisma.smsEventSetting?.updateMany) {
      await this.prisma.smsEventSetting.updateMany({
        where: { customTextVerifiedAt: { not: null } },
        data: { customTextVerifiedAt: null },
      });
    }
  }

  private normalizeProvider(value: string | undefined | null): SmsProviderName {
    const candidate = (value ?? '').toLowerCase();
    return (SMS_PROVIDER_NAMES as readonly string[]).includes(candidate)
      ? (candidate as SmsProviderName)
      : 'hisms';
  }

  private decryptPassword(payload: string | null | undefined): string {
    if (!payload) return '';
    try {
      return decryptSmsSecret(payload).value;
    } catch {
      return '';
    }
  }
}

function validateApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new BadRequestException('آدرس وب‌سرویس معتبر نیست.');
  }
  if (
    (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') ||
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new BadRequestException('آدرس وب‌سرویس باید امن و معتبر باشد.');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost' ||
    hostname === 'metadata' ||
    hostname === 'metadata.google.internal' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    (isIP(hostname) && !isPublicLiteral(hostname))
  )
    throw new BadRequestException('آدرس وب‌سرویس خصوصی یا محلی مجاز نیست.');
  return trimmed.replace(/\/+$/, '');
}

function isPublicLiteral(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  return isIP(address) === 6 && address.toLowerCase().startsWith('2');
}

function cleanDigits(value: string, label: string): string {
  const normalized = value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[\s-]/g, '');
  if (normalized && !/^\d{3,20}$/.test(normalized))
    throw new BadRequestException(`${label} معتبر نیست.`);
  return normalized;
}

function safeInt(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
  label: string,
) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new BadRequestException(`${label} معتبر نیست.`);
  return value;
}

function encryptLegacyOrClear(value: string): string | null {
  return value.trim() ? encryptForStorage(value.trim()) : null;
}

function encryptForStorage(value: string) {
  try {
    return encryptSmsSecret(value);
  } catch {
    throw new BadRequestException('کلید رمزگذاری SMS روی سرور پیکربندی نشده است.');
  }
}

function preserveEncrypted(payload: string | null | undefined): string | null {
  if (!payload) return null;
  if (!payload.startsWith('v1:')) return payload;
  try {
    const cleartext = decryptSmsSecret(payload).value;
    return cleartext ? encryptForStorage(cleartext) : null;
  } catch {
    // Preserve unreadable legacy ciphertext so a missing key never destroys credentials.
    return payload;
  }
}

function auditView(view: SmsSettingsView) {
  const { passwordConfigured, apiKeyConfigured, melipayamakPasswordConfigured, ...safe } = view;
  return { ...safe, passwordConfigured, apiKeyConfigured, melipayamakPasswordConfigured };
}
