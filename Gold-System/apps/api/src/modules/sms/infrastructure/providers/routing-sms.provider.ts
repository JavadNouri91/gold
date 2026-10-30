import { Injectable } from '@nestjs/common';
import { SmsProvider, SmsDeliveryResult } from './sms-provider.interface';
import { SmsProviderFactory } from './sms-provider.factory';
import { SmsSettingsService } from '../../application/sms-settings.service';

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
  ) {}

  async send(to: string, message: string): Promise<SmsDeliveryResult> {
    const config = await this.settings.resolveEffectiveConfig();
    const provider = this.factory.forProvider(config.provider);
    return provider.send(to, message, config);
  }
}
