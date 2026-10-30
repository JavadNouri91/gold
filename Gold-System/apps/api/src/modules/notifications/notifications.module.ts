/**
 * Notifications Module — Phase 7
 *
 * Implements the Notifications + SMS vertical slice.
 *
 * Architecture (docs/21-business-decisions.md §10.1):
 *   - Multi-provider SMS adapter (SMS.ir / Melipayamak / Mock)
 *   - Provider and credentials configured in the admin panel (SmsModule),
 *     with the .env values as the fallback
 *   - IN_APP and SMS channels
 *   - PENDING → SENT | FAILED delivery tracking
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
 */
import { Module } from '@nestjs/common';
import { NotificationService } from './application/notification.service';
import { NotificationRepository } from './infrastructure/repositories/notification.repository';
import { NotificationController } from './presentation/controllers/notification.controller';
import { AuditModule } from '../audit/audit.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [AuditModule, SmsModule],
  controllers: [NotificationController],
  providers: [
    // Repository
    NotificationRepository,
    // Application service
    NotificationService,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
