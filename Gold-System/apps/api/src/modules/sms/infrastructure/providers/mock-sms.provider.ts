import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider, SmsDeliveryResult } from './sms-provider.interface';

/**
 * Mock SMS Provider — for development and testing only.
 *
 * Selected when SMS_PROVIDER=mock (default in development).
 * Logs the message to the console at WARN level so developers
 * can see the SMS content without actually sending it.
 *
 * SECURITY: OTP values are logged here only in development.
 * This provider must NEVER be used in production.
 */
@Injectable()
export class MockSmsProvider implements SmsProvider {
  private readonly logger = new Logger(MockSmsProvider.name);
  readonly providerName = 'mock';

  async send(to: string, message: string): Promise<SmsDeliveryResult> {
    // Only log in development — never in production
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    if (nodeEnv === 'development' || nodeEnv === 'test') {
      this.logger.warn(`[MOCK SMS] To: ${to} | Message: ${message}`);
    }
    return {
      success: true,
      providerReference: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }
}
