/**
 * Notifications Module � Phase 7
 *
 * Implements the Notifications + SMS vertical slice.
 *
 * Architecture (docs/21-business-decisions.md �10.1):
 *   - Multi-provider SMS adapter (SMS.ir / Melipayamak / Mock)
 *   - Provider selected via SMS_PROVIDER env var
 *   - IN_APP and SMS channels
 *   - PENDING ? SENT | FAILED delivery tracking
 *   - Bounded retry (maxRetries, default=3)
 *   - OTP delivery via SMS provider
 *
 * This module is imported by:
 *   - AuthModule (OTP delivery)
 *   - KycModule (KYC approved/rejected notifications)
 *   - TradesModule (trade confirmed/reversed notifications)
 *   - PaymentsModule (payment recorded, settlement completed)
 *   - OrdersModule (order received notifications)
 *   - AssignmentsModule (order assigned notifications)
 *
 * EXPORTS: NotificationService (for cross-module event dispatch)
 *
 * open-questions.md #31: SMS provider final selection TBD.
 * Until resolved: mock provider is used (safe default).
 */
import { Module } from '@nestjs/common';
import { NotificationService } from './application/notification.service';
import { NotificationRepository } from './infrastructure/repositories/notification.repository';
import { NotificationController } from './presentation/controllers/notification.controller';
import { MockSmsProvider } from './infrastructure/providers/mock-sms.provider';
import { SmsSirProvider } from './infrastructure/providers/smsir.provider';
import { MelipayamakProvider } from './infrastructure/providers/melipayamak.provider';
import {
  SmsProviderFactory,
  smsProviderFactory,
} from './infrastructure/providers/sms-provider.factory';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [NotificationController],
  providers: [
    // Repository
    NotificationRepository,
    // Provider implementations
    MockSmsProvider,
    SmsSirProvider,
    MelipayamakProvider,
    // Factory that selects the active provider at runtime
    SmsProviderFactory,
    // Token-based injection: injects the selected SmsProvider
    smsProviderFactory,
    // Application service
    NotificationService,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
