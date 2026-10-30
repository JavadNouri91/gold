import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { toLatinDigits } from '../../../common/digits';
import { decryptSecret, encryptSecret, maskSecret } from '../../../common/crypto/secret-box';
import {
  SMS_PROVIDER_NAMES,
  SmsProviderName,
  SmsRuntimeConfig,
} from '../infrastructure/providers/sms-provider.interface';

/** Singleton row — this subsystem has exactly one configuration. */
export const SMS_SETTING_ID = 'global';

const SMSIR_DEFAULT_BASE_URL = 'https://api.sms.ir/v1';
const MELIPAYAMAK_DEFAULT_BASE_URL = 'https://rest.payamak-panel.com/api/SendSMS';

export interface SmsSettingsInput {
  provider: SmsProviderName;
  /** undefined = keep the stored value, '' = clear it (fall back to .env) */
  apiKey?: string;
  senderLine?: string;
  smsirBaseUrl?: string;
  melipayamakBaseUrl?: string;
  melipayamakPassword?: string;
}

export interface SmsSettingsView {
  provider: SmsProviderName;
  senderLine: string;
  smsirBaseUrl: string;
  melipayamakBaseUrl: string;
  /** Masked hint of the effective key — the full secret never leaves the API. */
  apiKeyMasked: string;
  apiKeySource: 'database' | 'environment' | 'none';
  melipayamakPasswordConfigured: boolean;
  /** True when at least one value is stored in the database. */
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

/**
 * SMS settings — admin-panel source of truth with .env fallback.
 *
 * Resolution order per field: database value (when present) → process env → default.
 * Secrets are encrypted at rest and are only ever returned masked.
 */
@Injectable()
export class SmsSettingsService {
  private readonly logger = new Logger(SmsSettingsService.name);
  private decryptWarned = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly audit: AuditService,
  ) {}

  // ─── Read ────────────────────────────────────────────────────────────────

  async getView(): Promise<SmsSettingsView> {
    const row = await this.prisma.smsSetting.findUnique({ where: { id: SMS_SETTING_ID } });
    const env = this.envConfig();

    const dbApiKey = this.decrypt(row?.apiKeyEncrypted);
    const apiKey = dbApiKey || env.apiKey || '';
    const dbPassword = this.decrypt(row?.melipayamakPasswordEncrypted);
    const melipayamakPassword = dbPassword || env.melipayamakPassword || '';

    return {
      provider: this.normalizeProvider(row?.provider || env.provider),
      senderLine: row?.senderLine || env.senderLine || '',
      smsirBaseUrl: row?.smsirBaseUrl || env.smsirBaseUrl || SMSIR_DEFAULT_BASE_URL,
      melipayamakBaseUrl:
        row?.melipayamakBaseUrl || env.melipayamakBaseUrl || MELIPAYAMAK_DEFAULT_BASE_URL,
      apiKeyMasked: maskSecret(apiKey),
      apiKeySource: dbApiKey ? 'database' : env.apiKey ? 'environment' : 'none',
      melipayamakPasswordConfigured: Boolean(melipayamakPassword),
      storedInDatabase: Boolean(row),
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
      updatedById: row?.updatedById ?? null,
    };
  }

  /** Credentials used for an actual SMS send. */
  async resolveEffectiveConfig(): Promise<SmsRuntimeConfig> {
    const row = await this.prisma.smsSetting.findUnique({ where: { id: SMS_SETTING_ID } });
    const env = this.envConfig();

    return {
      provider: this.normalizeProvider(row?.provider || env.provider),
      apiKey: this.decrypt(row?.apiKeyEncrypted) || env.apiKey || '',
      senderLine: row?.senderLine || env.senderLine || '',
      smsirBaseUrl: row?.smsirBaseUrl || env.smsirBaseUrl || SMSIR_DEFAULT_BASE_URL,
      melipayamakBaseUrl:
        row?.melipayamakBaseUrl || env.melipayamakBaseUrl || MELIPAYAMAK_DEFAULT_BASE_URL,
      melipayamakPassword:
        this.decrypt(row?.melipayamakPasswordEncrypted) || env.melipayamakPassword || '',
    };
  }

  // ─── Reveal (explicit, audited) ──────────────────────────────────────────

  /**
   * Returns the effective secrets in plaintext for the admin panel.
   *
   * The regular GET never carries a secret; the panel asks for this only when
   * an administrator clicks "نمایش". Every call is written to the audit log so
   * a secret read is traceable to a person and an IP.
   */
  async revealSecrets(
    actorId: string,
    ipAddress?: string,
  ): Promise<{
    apiKey: string;
    melipayamakPassword: string;
    apiKeySource: SmsSettingsView['apiKeySource'];
  }> {
    const row = await this.prisma.smsSetting.findUnique({ where: { id: SMS_SETTING_ID } });
    const env = this.envConfig();

    const dbApiKey = this.decrypt(row?.apiKeyEncrypted);
    const apiKey = dbApiKey || env.apiKey || '';
    const melipayamakPassword =
      this.decrypt(row?.melipayamakPasswordEncrypted) || env.melipayamakPassword || '';

    await this.audit.log({
      actorId,
      action: 'SMS_SETTINGS_SECRET_REVEALED',
      entityType: 'SmsSetting',
      entityId: SMS_SETTING_ID,
      ipAddress,
      after: {
        apiKeySource: dbApiKey ? 'database' : env.apiKey ? 'environment' : 'none',
        apiKey: maskSecret(apiKey),
        melipayamakPasswordConfigured: Boolean(melipayamakPassword),
      },
    });

    return {
      apiKey,
      melipayamakPassword,
      apiKeySource: dbApiKey ? 'database' : env.apiKey ? 'environment' : 'none',
    };
  }

  // ─── Write ───────────────────────────────────────────────────────────────

  async update(
    input: SmsSettingsInput,
    actorId: string,
    ipAddress?: string,
  ): Promise<SmsSettingsView> {
    const provider = this.normalizeProvider(input.provider);
    this.assertProviderAllowed(provider);

    const senderLine = this.cleanSenderLine(input.senderLine);
    const smsirBaseUrl = this.cleanBaseUrl(input.smsirBaseUrl);
    const melipayamakBaseUrl = this.cleanBaseUrl(input.melipayamakBaseUrl);

    const before = await this.getView();
    const existing = await this.prisma.smsSetting.findUnique({ where: { id: SMS_SETTING_ID } });

    const data = {
      provider,
      senderLine: senderLine === undefined ? (existing?.senderLine ?? null) : senderLine,
      smsirBaseUrl: smsirBaseUrl === undefined ? (existing?.smsirBaseUrl ?? null) : smsirBaseUrl,
      melipayamakBaseUrl:
        melipayamakBaseUrl === undefined
          ? (existing?.melipayamakBaseUrl ?? null)
          : melipayamakBaseUrl,
      apiKeyEncrypted:
        input.apiKey === undefined
          ? (existing?.apiKeyEncrypted ?? null)
          : this.encryptOrNull(input.apiKey),
      melipayamakPasswordEncrypted:
        input.melipayamakPassword === undefined
          ? (existing?.melipayamakPasswordEncrypted ?? null)
          : this.encryptOrNull(input.melipayamakPassword),
      updatedById: actorId,
    };

    await this.prisma.smsSetting.upsert({
      where: { id: SMS_SETTING_ID },
      create: { id: SMS_SETTING_ID, ...data },
      update: data,
    });

    const after = await this.getView();
    await this.audit.log({
      actorId,
      action: 'SMS_SETTINGS_CHANGED',
      entityType: 'SmsSetting',
      entityId: SMS_SETTING_ID,
      ipAddress,
      before: { ...before },
      after: { ...after },
    });

    return after;
  }

  /** Drop the database overrides so the .env values apply again. */
  async resetToEnv(actorId: string, ipAddress?: string): Promise<SmsSettingsView> {
    const before = await this.getView();
    await this.prisma.smsSetting.deleteMany({ where: { id: SMS_SETTING_ID } });

    const after = await this.getView();
    await this.audit.log({
      actorId,
      action: 'SMS_SETTINGS_RESET',
      entityType: 'SmsSetting',
      entityId: SMS_SETTING_ID,
      ipAddress,
      before: { ...before },
      after: { ...after },
    });

    return after;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private envConfig(): SmsEnvConfig {
    return (this.configService.get('sms') as SmsEnvConfig | undefined) ?? {};
  }

  private normalizeProvider(value: string | undefined | null): SmsProviderName {
    const normalized = (value ?? '').trim().toLowerCase();
    return (SMS_PROVIDER_NAMES as readonly string[]).includes(normalized)
      ? (normalized as SmsProviderName)
      : 'mock';
  }

  private assertProviderAllowed(provider: SmsProviderName): void {
    if (provider === 'mock' && (process.env.NODE_ENV ?? 'development') === 'production') {
      throw new BadRequestException(
        'در محیط عملیاتی نمی‌توان ارائه‌دهنده پیامک را روی mock گذاشت.',
      );
    }
  }

  private cleanSenderLine(value: string | undefined): string | null | undefined {
    if (value === undefined) return undefined;
    const normalized = toLatinDigits(value).replace(/[\s-]/g, '');
    if (!normalized) return null;
    if (!/^\d{3,20}$/.test(normalized)) {
      throw new BadRequestException('شماره خط فرستنده باید فقط رقم باشد.');
    }
    return normalized;
  }

  private cleanBaseUrl(value: string | undefined): string | null | undefined {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^https?:\/\/[^\s]+$/i.test(trimmed)) {
      throw new BadRequestException('آدرس پایه باید با http:// یا https:// شروع شود.');
    }
    return trimmed.replace(/\/+$/, '');
  }

  private encryptOrNull(value: string): string | null {
    const trimmed = value.trim();
    return trimmed ? encryptSecret(trimmed) : null;
  }

  private decrypt(payload: string | null | undefined): string {
    if (!payload) return '';
    try {
      return decryptSecret(payload);
    } catch (err: unknown) {
      if (!this.decryptWarned) {
        this.decryptWarned = true;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[SmsSettings] Stored secret could not be decrypted (${message}). ` +
            'Falling back to the .env values; re-save the key in the admin panel.',
        );
      }
      return '';
    }
  }
}
