import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import {
  SMS_PROVIDER_TOKEN,
  SmsProvider,
} from '../infrastructure/providers/sms-provider.interface';
import { SmsSettingsService } from './sms-settings.service';

const TEST_MESSAGE = 'این یک پیامک آزمایشی از سامانه معاملات طلا است.';

export interface SmsTestResult {
  success: boolean;
  provider: string;
  providerReference?: string;
  error?: string;
}

@Injectable()
export class SmsTestService {
  constructor(
    @Inject(SMS_PROVIDER_TOKEN) private readonly smsProvider: SmsProvider,
    private readonly settings: SmsSettingsService,
    private readonly audit: AuditService,
  ) {}

  async sendTest(mobile: string, actorId: string, ipAddress?: string): Promise<SmsTestResult> {
    const config = await this.settings.resolveEffectiveConfig();
    if (!config.enabled) throw new BadRequestException('سرویس پیامک غیرفعال است.');
    if (
      config.provider === 'hisms' &&
      (!config.apiBaseUrl || !config.username || !config.password || !config.originator)
    )
      throw new BadRequestException('تنظیمات سرویس پیامک کامل نیست.');
    if (config.provider === 'smsir' && !config.apiKey)
      throw new BadRequestException('کلید API سرویس پیامک تنظیم نشده است.');
    if (config.provider === 'melipayamak' && (!config.apiKey || !config.melipayamakPassword))
      throw new BadRequestException('اطلاعات ورود سرویس پیامک کامل نیست.');

    const result = await this.smsProvider.send(mobile, TEST_MESSAGE);
    await this.audit.log({
      actorId,
      action: 'SMS_SETTINGS_TEST',
      entityType: 'SmsSetting',
      entityId: 'global',
      ipAddress,
      after: {
        provider: config.provider,
        mobileMasked: maskMobile(mobile),
        success: result.success,
        error: result.error ? 'ارسال ناموفق' : null,
        providerReference: result.providerReference ?? null,
      },
    });
    return {
      success: result.success,
      provider: config.provider,
      providerReference: result.providerReference,
      error: result.error,
    };
  }
}

function maskMobile(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length > 4 ? `${digits.slice(0, 3)}***${digits.slice(-2)}` : '***';
}
