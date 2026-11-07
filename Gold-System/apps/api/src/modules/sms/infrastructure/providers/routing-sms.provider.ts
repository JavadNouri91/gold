import { Injectable } from '@nestjs/common';
import { SmsProvider, SmsDeliveryResult } from './sms-provider.interface';
import { SmsProviderFactory } from './sms-provider.factory';
import { SmsSettingsService } from '../../application/sms-settings.service';
import { PrismaService } from '../../../../database/prisma.service';

/**
 * Provider handed to NotificationService.
 *
 * Resolves the credentials and the provider name on every send, so changes
 * made in the admin panel take effect immediately without an API restart
 * (unlike the .env values, which are cached at bootstrap).
 */
@Injectable()
export class RoutingSmsProvider implements SmsProvider {
  readonly providerName = 'routing';

  constructor(
    private readonly settings: SmsSettingsService,
    private readonly factory: SmsProviderFactory,
    private readonly prisma: PrismaService,
  ) {}

  async send(to: string, message: string): Promise<SmsDeliveryResult> {
    const config = await this.settings.resolveEffectiveConfig();
    if (!config.enabled) return { success: false, error: 'سرویس پیامک غیرفعال است.' };
    if (process.env.NODE_ENV === 'production' && config.provider === 'mock')
      return { success: false, error: 'حالت آزمایشی پیامک در محیط عملیاتی مجاز نیست.' };
    const provider = this.factory.forProvider(config.provider);
    const result = await provider.send(to, message, config);
    await this.log(to, config.provider, 'transactional', result, config.otpTemplate);
    return result;
  }

  async sendOtp(to: string, code: string, purpose: string): Promise<SmsDeliveryResult> {
    const config = await this.settings.resolveEffectiveConfig();
    if (!config.enabled) return { success: false, error: 'سرویس پیامک غیرفعال است.' };
    if (process.env.NODE_ENV === 'production' && config.provider === 'mock')
      return { success: false, error: 'حالت آزمایشی پیامک در محیط عملیاتی مجاز نیست.' };
    const provider = this.factory.forProvider(config.provider);
    const result = provider.sendOtp
      ? await provider.sendOtp(to, code, purpose, config)
      : await provider.send(to, `کد تأیید شما: ${code}\nاعتبار: ۲ دقیقه`, config);
    await this.log(to, config.provider, purpose, result, config.otpTemplate);
    return result;
  }

  private async log(
    to: string,
    provider: string,
    purpose: string,
    result: SmsDeliveryResult,
    templateCode?: string,
  ) {
    try {
      await this.prisma.smsMessageLog.create({
        data: {
          provider,
          purpose,
          recipientMasked: maskMobile(to),
          templateCode: templateCode || null,
          providerReferenceId: result.providerReference ?? null,
          providerErrorCode: result.errorCode ?? null,
          acceptanceStatus: result.success ? 'ACCEPTED' : 'REJECTED',
          deliveryStatus: null,
        },
      });
    } catch {
      // Provider outcome must not be retried just because the audit record failed.
    }
  }
}

function maskMobile(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length > 4 ? `${digits.slice(0, 3)}***${digits.slice(-2)}` : '***';
}
