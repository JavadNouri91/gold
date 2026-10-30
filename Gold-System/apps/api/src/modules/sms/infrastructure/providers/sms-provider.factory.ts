import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider, SmsProviderName } from './sms-provider.interface';
import { MockSmsProvider } from './mock-sms.provider';
import { SmsSirProvider } from './smsir.provider';
import { MelipayamakProvider } from './melipayamak.provider';

/**
 * SMS Provider Factory
 *
 * docs/21-business-decisions.md §10.1:
 *   "Architecture must support multiple notification providers."
 *
 * The provider name arrives from SmsSettingsService on every send, so an
 * administrator can switch providers from the panel without a restart.
 *
 * VALID VALUES: 'smsir' | 'melipayamak' | 'mock'
 * DEFAULT: 'mock' (safe for development and testing)
 */
@Injectable()
export class SmsProviderFactory {
  private readonly logger = new Logger(SmsProviderFactory.name);

  constructor(
    private readonly mockProvider: MockSmsProvider,
    private readonly smsSirProvider: SmsSirProvider,
    private readonly melipayamakProvider: MelipayamakProvider,
  ) {}

  forProvider(name: string): SmsProvider {
    const providerName = (name || 'mock').toLowerCase() as SmsProviderName;
    const nodeEnv = process.env.NODE_ENV ?? 'development';

    switch (providerName) {
      case 'smsir':
        return this.smsSirProvider;
      case 'melipayamak':
        return this.melipayamakProvider;
      case 'mock':
        if (nodeEnv === 'production') {
          throw new Error('SMS provider "mock" is not permitted when NODE_ENV=production');
        }
        this.logger.warn('[SmsProviderFactory] Using MOCK SMS provider — NOT for production use');
        return this.mockProvider;
      default:
        if (nodeEnv === 'production') {
          throw new Error(`Unknown SMS provider "${providerName}" is not permitted in production`);
        }
        this.logger.warn(
          `[SmsProviderFactory] Unknown provider "${providerName}", falling back to mock`,
        );
        return this.mockProvider;
    }
  }
}
