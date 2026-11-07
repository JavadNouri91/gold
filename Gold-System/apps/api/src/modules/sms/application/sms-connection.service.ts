import { Injectable } from '@nestjs/common';
import { HismsProvider } from '../infrastructure/providers/hisms.provider';
import { SmsSettingsService } from './sms-settings.service';

@Injectable()
export class SmsConnectionService {
  constructor(
    private readonly settings: SmsSettingsService,
    private readonly provider: HismsProvider,
  ) {}

  async test(actorId: string, ipAddress?: string) {
    const checkedAt = new Date().toISOString();
    const config = await this.settings.resolveEffectiveConfig();
    const complete =
      config.provider === 'hisms' &&
      Boolean(config.apiBaseUrl && config.username && config.password);
    const result = complete
      ? await this.provider.getUserInfo(config)
      : { success: false, error: 'تنظیمات ناقص است.' };
    const message = result.success
      ? 'اتصال برقرار است.'
      : (result.error ?? 'ارتباط با سرویس پیامک برقرار نشد.');
    await this.settings.recordConnectionTest(actorId, ipAddress, {
      success: result.success,
      message,
    });
    return {
      success: result.success,
      status: result.success ? 'connected' : complete ? 'disconnected' : 'incomplete',
      message,
      credit: result.credit ?? null,
      checkedAt,
    };
  }
}
