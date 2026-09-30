import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsProvider, SMS_PROVIDER_TOKEN } from './sms-provider.interface';
import { MockSmsProvider } from './mock-sms.provider';
import { SmsSirProvider } from './smsir.provider';
import { MelipayamakProvider } from './melipayamak.provider';

/**
 * SMS Provider Factory
 *
 * Selects the concrete SMS provider based on SMS_PROVIDER env var.
 *
 * docs/21-business-decisions.md §10.1:
 *   "Architecture must support multiple notification providers."
 * open-questions.md #31: Provider final selection TBD.
 *
 * VALID VALUES: 'smsir' | 'melipayamak' | 'mock'
 * DEFAULT: 'mock' (safe for development and testing)
 */
@Injectable()
export class SmsProviderFactory {
  private readonly logger = new Logger(SmsProviderFactory.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mockProvider: MockSmsProvider,
    private readonly smsSirProvider: SmsSirProvider,
    private readonly melipayamakProvider: MelipayamakProvider,
  ) {}

  create(): SmsProvider {
    const smsConfig = this.configService.get('sms');
    const providerName = (smsConfig.provider as string).toLowerCase();
    const nodeEnv = process.env.NODE_ENV ?? 'development';

    switch (providerName) {
      case 'smsir':
        this.logger.log('[SmsProviderFactory] Using SMS.ir provider');
        return this.smsSirProvider;
      case 'melipayamak':
        this.logger.log('[SmsProviderFactory] Using Melipayamak provider');
        return this.melipayamakProvider;
      case 'mock':
        if (nodeEnv === 'production') {
          throw new Error('SMS_PROVIDER=mock is not permitted when NODE_ENV=production');
        }
        this.logger.warn('[SmsProviderFactory] Using MOCK SMS provider — NOT for production use');
        return this.mockProvider;
      default:
        if (nodeEnv === 'production') {
          throw new Error(`Unknown SMS_PROVIDER "${providerName}" is not permitted in production`);
        }
        this.logger.warn(
          `[SmsProviderFactory] Unknown provider "${providerName}", falling back to mock`,
        );
        return this.mockProvider;
    }
  }
}

export const smsProviderFactory = {
  provide: SMS_PROVIDER_TOKEN,
  useFactory: (factory: SmsProviderFactory): SmsProvider => factory.create(),
  inject: [SmsProviderFactory],
};
