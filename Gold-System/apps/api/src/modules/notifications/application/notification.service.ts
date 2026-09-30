import { Injectable, Logger, Inject, BadRequestException } from '@nestjs/common';
import { NotificationRepository } from '../infrastructure/repositories/notification.repository';
import {
  SmsProvider,
  SMS_PROVIDER_TOKEN,
} from '../infrastructure/providers/sms-provider.interface';
import { AuditService } from '../../audit/application/audit.service';
import { NotificationEntity } from '../domain/entities/notification.entity';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  NOTIFICATION_CHANNELS,
} from '../domain/constants/notification-types';
import {
  NotificationNotFoundException,
  NotificationAccessDeniedException,
  NotificationNotRetryableException,
} from '../domain/exceptions/notification.exceptions';
import { InboxCriteria } from '../domain/inbox-filter';
import { NotificationRelationDto } from '../domain/owned-relation';
import { ListNotificationsQueryDto } from './dto/list-notifications.query';

export interface DispatchNotificationInput {
  /** User ID of the recipient (null for system-level notifications) */
  recipientId: string | null;
  /** Mobile number for SMS delivery */
  recipientMobile?: string | null;
  /** The business event type */
  type: NotificationType;
  /** Optional subject / title */
  subject?: string;
  /** Message body */
  body: string;
  /** Source entity for tracing */
  relatedEntityType?: string;
  relatedEntityId?: string;
}

/**
 * Notification Service
 *
 * Core orchestrator for the notification system.
 *
 * ARCHITECTURE (docs/21-business-decisions.md §10.1):
 *   Business Event → NotificationService.dispatch() → DB record → Provider → SMS/In-App
 *
 * ISOLATION RULE:
 *   dispatch() NEVER throws — provider failures are recorded as FAILED status.
 *   Business transactions remain unaffected by notification failures.
 *
 * CHANNELS:
 *   - SMS: delivered via injected SmsProvider (selected by env var)
 *   - IN_APP: stored as Notification record; customer polls via GET /notifications
 *
 * OTP DELIVERY:
 *   OTP codes (already hashed in DB) are sent via sendOtp() which calls
 *   the SMS provider directly. The plaintext code is NEVER stored.
 *
 * RETRY:
 *   Failed notifications can be retried via retryNotification() (staff only).
 *   Bounded by maxRetries (default: 3). Idempotent: retry creates a new attempt
 *   on the existing record, not a duplicate record.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationRepo: NotificationRepository,
    @Inject(SMS_PROVIDER_TOKEN) private readonly smsProvider: SmsProvider,
    private readonly audit: AuditService,
  ) {}

  // ─── Core Dispatch ───────────────────────────────────────────────────────

  /**
   * Dispatches notifications for a business event.
   *
   * Creates one Notification record per channel documented for the event type.
   * Attempts delivery for each record.
   * NEVER throws — all errors are captured in the Notification record.
   */
  async dispatch(input: DispatchNotificationInput): Promise<NotificationEntity[]> {
    const channels = NOTIFICATION_CHANNELS[input.type] ?? [NotificationChannel.IN_APP];
    const results: NotificationEntity[] = [];

    for (const channel of channels) {
      try {
        const notification = await this.notificationRepo.create({
          recipientId: input.recipientId,
          recipientMobile: input.recipientMobile ?? null,
          channel,
          type: input.type,
          subject: input.subject ?? null,
          body: input.body,
          relatedEntityType: input.relatedEntityType ?? null,
          relatedEntityId: input.relatedEntityId ?? null,
        });

        const delivered = await this.attemptDelivery(notification, input.recipientMobile ?? null);
        results.push(delivered);
      } catch (err: unknown) {
        // Never propagate errors — just log
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[NotificationService] dispatch failed for type=${input.type} channel=${channel}: ${msg}`,
        );
      }
    }

    return results;
  }

  /**
   * Sends an OTP code via SMS.
   *
   * The plaintext OTP is passed directly to the SMS provider and NEVER stored.
   * The DB record stores only the type/status, not the OTP value.
   *
   * SECURITY:
   * - OTP plaintext is NOT logged at any level when NODE_ENV=production.
   * - The mock provider logs OTP in development/test mode only.
   */
  async sendOtp(userId: string | null, mobile: string, otpPlaintext: string): Promise<void> {
    const body = `کد تایید شما: ${otpPlaintext}\nاعتبار: ۲ دقیقه`;

    // Create notification record (status=PENDING — body does NOT contain OTP for security)
    let notification: NotificationEntity;
    try {
      notification = await this.notificationRepo.create({
        recipientId: userId,
        recipientMobile: mobile,
        channel: NotificationChannel.SMS,
        type: NotificationType.OTP_LOGIN,
        subject: null,
        body: '[OTP_DELIVERY]', // Redacted in DB — actual OTP never stored
        relatedEntityType: null,
        relatedEntityId: null,
        maxRetries: 0, // OTPs are not retried — user requests a new one
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[NotificationService] OTP DB record creation failed: ${msg}`);
      // Still attempt SMS delivery even if DB record creation fails
      await this.deliverSms(null, mobile, body);
      return;
    }

    // Deliver the actual OTP content via SMS provider
    const result = await this.deliverSms(notification.id, mobile, body);

    if (!result.success) {
      this.logger.error(`[NotificationService] OTP SMS delivery failed for mobile=${mobile}`);
    }
  }

  // ─── Read Operations ─────────────────────────────────────────────────────

  async listForRecipient(
    actorUserId: string,
    recipientId: string,
    isStaff: boolean,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<NotificationEntity[]> {
    if (!isStaff && actorUserId !== recipientId) {
      throw new NotificationAccessDeniedException();
    }
    return this.notificationRepo.findByRecipient(recipientId, opts);
  }

  async getById(
    actorUserId: string,
    notificationId: string,
    isStaff: boolean,
  ): Promise<NotificationEntity> {
    const notification = await this.notificationRepo.findById(notificationId);
    if (!notification) throw new NotificationNotFoundException(notificationId);
    if (!isStaff && notification.recipientId !== actorUserId) {
      throw new NotificationAccessDeniedException();
    }
    return notification;
  }

  async listInbox(
    actorUserId: string,
    query: ListNotificationsQueryDto,
  ): Promise<{
    items: NotificationEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (
      (from && Number.isNaN(from.getTime())) ||
      (to && Number.isNaN(to.getTime())) ||
      (from && to && from > to)
    ) {
      throw new BadRequestException({ code: 'INVALID_RANGE', message: 'Invalid date range' });
    }

    const criteria: InboxCriteria & { page: number; limit: number; sort: 'newest' | 'oldest' } = {
      read: query.read ?? 'all',
      category: query.category,
      q: query.q?.trim().slice(0, 100) || undefined,
      from,
      to,
      page,
      limit,
      sort: query.sort ?? 'newest',
    };
    const result = await this.notificationRepo.findInbox(actorUserId, criteria);
    return {
      items: result.items,
      meta: {
        page,
        limit,
        total: result.total,
        totalPages: result.total === 0 ? 0 : Math.ceil(result.total / limit),
      },
    };
  }

  summary(actorUserId: string) {
    return this.notificationRepo.countSummary(actorUserId);
  }

  async relationFor(notification: NotificationEntity): Promise<NotificationRelationDto | null> {
    return this.notificationRepo.resolveRelation(
      notification.recipientId,
      notification.relatedEntityType,
      notification.relatedEntityId,
    );
  }

  async markRead(actorUserId: string, notificationId: string): Promise<NotificationEntity> {
    const updated = await this.notificationRepo.markRead(actorUserId, notificationId);
    if (updated) return updated;
    const existing = await this.notificationRepo.findById(notificationId);
    if (!existing) throw new NotificationNotFoundException(notificationId);
    throw new NotificationAccessDeniedException();
  }

  async markReadMany(actorUserId: string, ids: string[]): Promise<number> {
    const unique = [...new Set(ids)].slice(0, 100);
    return this.notificationRepo.markReadMany(actorUserId, unique);
  }

  markAllRead(actorUserId: string): Promise<number> {
    return this.notificationRepo.markAllRead(actorUserId);
  }

  // ─── Retry (staff only) ───────────────────────────────────────────────────

  /**
   * Retry a failed notification.
   *
   * Bounded: throws if retryCount >= maxRetries.
   * Idempotent on the notification record (updates retryCount, does not duplicate).
   * Audited: records retry attempt.
   */
  async retryNotification(
    notificationId: string,
    actorUserId: string,
  ): Promise<NotificationEntity> {
    const notification = await this.notificationRepo.findById(notificationId);
    if (!notification) throw new NotificationNotFoundException(notificationId);
    if (!notification.canRetry()) {
      throw new NotificationNotRetryableException(
        notificationId,
        notification.retryCount >= notification.maxRetries
          ? `maxRetries (${notification.maxRetries}) reached`
          : `status is ${notification.status}`,
      );
    }

    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'NOTIFICATION_RETRY',
      entityType: 'Notification',
      entityId: notificationId,
      before: { status: notification.status, retryCount: notification.retryCount },
      after: { status: NotificationStatus.PENDING, retryCount: notification.retryCount + 1 },
    });

    const pending = await this.notificationRepo.markRetrying(notificationId);
    return this.attemptDelivery(pending, notification.recipientMobile);
  }

  // ─── Internal Helpers ────────────────────────────────────────────────────

  private async attemptDelivery(
    notification: NotificationEntity,
    mobile: string | null | undefined,
  ): Promise<NotificationEntity> {
    if (notification.channel === NotificationChannel.IN_APP) {
      // IN_APP: stored in DB; customer polls via API. No external delivery needed.
      return this.notificationRepo.markSent(notification.id, 'in_app');
    }

    if (notification.channel === NotificationChannel.SMS) {
      const to = mobile ?? notification.recipientMobile;
      if (!to) {
        return this.notificationRepo.markFailed(notification.id, 'NO_MOBILE_NUMBER');
      }
      const result = await this.smsProvider.send(to, notification.body);
      if (result.success) {
        return this.notificationRepo.markSent(notification.id, result.providerReference ?? '');
      }
      return this.notificationRepo.markFailed(notification.id, result.error ?? 'UNKNOWN_SMS_ERROR');
    }

    return this.notificationRepo.markFailed(
      notification.id,
      `UNSUPPORTED_CHANNEL:${notification.channel}`,
    );
  }

  private async deliverSms(
    notificationId: string | null,
    mobile: string,
    body: string,
  ): Promise<{ success: boolean }> {
    const result = await this.smsProvider.send(mobile, body);
    if (notificationId) {
      if (result.success) {
        await this.notificationRepo.markSent(notificationId, result.providerReference ?? '');
      } else {
        await this.notificationRepo.markFailed(notificationId, result.error ?? 'UNKNOWN_SMS_ERROR');
      }
    }
    return { success: result.success };
  }
}
