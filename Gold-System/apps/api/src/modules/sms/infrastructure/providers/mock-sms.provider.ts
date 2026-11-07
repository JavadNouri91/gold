import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SmsDeliveryResult, SmsProvider } from './sms-provider.interface';

@Injectable()
export class MockSmsProvider implements SmsProvider {
  private readonly logger = new Logger(MockSmsProvider.name);
  readonly providerName = 'mock';

  async send(_to: string, _message: string): Promise<SmsDeliveryResult> {
    if (process.env.NODE_ENV === 'development') this.logger.warn('Simulated SMS delivery.');
    return { success: true, providerReference: `mock-${randomUUID()}` };
  }
}
