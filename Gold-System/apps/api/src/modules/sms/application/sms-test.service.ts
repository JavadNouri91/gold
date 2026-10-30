import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import {
  SMS_PROVIDER_TOKEN,
  SmsProvider,
} from '../infrastructure/providers/sms-provider.interface';
import { SmsSettingsService } from './sms-settings.service';

const TEST_MESSAGE = 'پیامک آزمایشی سامانه طلا — تنظیمات پیامک به‌درستی اعمال شده است.';

export interface SmsTestResult {
  success: boolean;
  provider: string;
  providerReference?: string;
  error?: string;
}

/**
 * Sends one live SMS with the currently resolved credentials so an
 * administrator can verify a freshly saved API key.
 *
 * Kept separate from SmsSettingsService: that service is a dependency of
 * RoutingSmsProvider, so it must not depend on the provider token itself.
 */
@Injectable()
export class SmsTestService {
  private readonly logger = new Logger(SmsTestService.name);

  constructor(
    @Inject(SMS_PROVIDER_TOKEN) private readonly smsProvider: SmsProvider,
    private readonly settings: SmsSettingsService,
    private readonly audit: AuditService,
  ) {}

  async sendTest(mobile: string, actorId: string, ipAddress?: string): Promise<SmsTestResult> {
    const config = await this.settings.resolveEffectiveConfig();

    if (config.provider !== 'mock' && !config.apiKey) {
      throw new BadRequestException('ابتدا کلید API را ذخیره کنید.');
    }
    if (config.provider !== 'mock' && !config.senderLine) {
      throw new BadRequestException('ابتدا شماره خط فرستنده را ذخیره کنید.');
    }

    const result = await this.smsProvider.send(mobile, TEST_MESSAGE);
    if (!result.success) {
      this.logger.warn(
        `[SMS test] provider=${config.provider} failed: ${result.error ?? 'unknown error'}`,
      );
    }

    await this.audit.log({
      actorId,
      action: 'SMS_SETTINGS_TEST',
      entityType: 'SmsSetting',
      entityId: 'global',
      ipAddress,
      after: {
        provider: config.provider,
        mobile,
        success: result.success,
        error: result.error ?? null,
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
