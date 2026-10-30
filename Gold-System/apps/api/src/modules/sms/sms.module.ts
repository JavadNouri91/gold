import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SMS_PROVIDER_TOKEN } from './infrastructure/providers/sms-provider.interface';
import { MockSmsProvider } from './infrastructure/providers/mock-sms.provider';
import { SmsSirProvider } from './infrastructure/providers/smsir.provider';
import { MelipayamakProvider } from './infrastructure/providers/melipayamak.provider';
import { SmsProviderFactory } from './infrastructure/providers/sms-provider.factory';
import { RoutingSmsProvider } from './infrastructure/providers/routing-sms.provider';
import { SmsSettingsService } from './application/sms-settings.service';
import { SmsTestService } from './application/sms-test.service';
import { SmsCreditService } from './application/sms-credit.service';
import { SmsLinesService } from './application/sms-lines.service';
import { SmsSettingsController } from './presentation/controllers/sms-settings.controller';

/**
 * SMS module — provider adapters plus the admin-panel configuration.
 *
 * The injected SMS_PROVIDER_TOKEN is a RoutingSmsProvider: it resolves the
 * credentials on every send, so the provider and the API key can be changed
 * from the panel without restarting the API.
 *
 * Exported:
 *   - SMS_PROVIDER_TOKEN  (NotificationService sends OTP and business SMS)
 *   - SmsSettingsService  (callers that need the resolved configuration)
 */
@Module({
  imports: [AuditModule],
  controllers: [SmsSettingsController],
  providers: [
    MockSmsProvider,
    SmsSirProvider,
    MelipayamakProvider,
    SmsProviderFactory,
    SmsSettingsService,
    RoutingSmsProvider,
    SmsTestService,
    SmsCreditService,
    SmsLinesService,
    {
      provide: SMS_PROVIDER_TOKEN,
      useFactory: (routing: RoutingSmsProvider) => routing,
      inject: [RoutingSmsProvider],
    },
  ],
  exports: [SMS_PROVIDER_TOKEN, SmsSettingsService],
})
export class SmsModule {}
