/**
 * Notification Type Constants
 *
 * Derived from: docs/16-notifications-and-audit.md
 * Provider architecture: docs/21-business-decisions.md §10.1
 *
 * RULE: Notification types must map 1:1 to documented business events.
 * DO NOT add types for undocumented events.
 */

export enum NotificationChannel {
  SMS = 'SMS',
  IN_APP = 'IN_APP',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export enum NotificationType {
  // ── Customer-facing (docs/16: Customer section) ──────────────────
  /** Customer account registered — docs/16 "registration received" */
  CUSTOMER_REGISTERED = 'CUSTOMER_REGISTERED',
  /** KYC verification approved — docs/16 "KYC approved" */
  KYC_APPROVED = 'KYC_APPROVED',
  /** KYC verification rejected — docs/16 "KYC rejected" */
  KYC_REJECTED = 'KYC_REJECTED',
  /** Order submitted — docs/16 "order received" */
  ORDER_RECEIVED = 'ORDER_RECEIVED',
  /** Quotation generated for order — docs/16 "quotation generated" */
  QUOTATION_GENERATED = 'QUOTATION_GENERATED',
  /** Order assigned to reviewer — docs/16 "review started if appropriate" */
  REVIEW_STARTED = 'REVIEW_STARTED',
  /** Trade confirmed/approved — docs/16 "trade approved" */
  TRADE_CONFIRMED = 'TRADE_CONFIRMED',
  /** Trade reversed — docs/16 "trade rejected" */
  TRADE_REVERSED = 'TRADE_REVERSED',
  /** Payment recorded against trade — docs/16 "payment recorded" */
  PAYMENT_RECORDED = 'PAYMENT_RECORDED',
  /** Trade fully settled — docs/16 "settlement completed" */
  SETTLEMENT_COMPLETED = 'SETTLEMENT_COMPLETED',

  // ── Internal staff notifications (docs/16: Internal section) ─────
  /** New order submitted — internal — docs/16 "new order" */
  INTERNAL_NEW_ORDER = 'INTERNAL_NEW_ORDER',
  /** Order assigned to reviewer — docs/16 "assigned order" */
  INTERNAL_ORDER_ASSIGNED = 'INTERNAL_ORDER_ASSIGNED',
  /** Review pending — docs/16 "pending review" */
  INTERNAL_PENDING_REVIEW = 'INTERNAL_PENDING_REVIEW',
  /** Payment issue detected — docs/16 "payment issue" */
  INTERNAL_PAYMENT_ISSUE = 'INTERNAL_PAYMENT_ISSUE',
  /** Settlement issue detected — docs/16 "settlement issue" */
  INTERNAL_SETTLEMENT_ISSUE = 'INTERNAL_SETTLEMENT_ISSUE',
  // NOTE: PRICE_FEED_FAILURE not implemented — requires price-feed background job

  // ── OTP (docs/21-business-decisions.md §11.1) ─────────────────────
  /** Login OTP — delivered via SMS */
  OTP_LOGIN = 'OTP_LOGIN',
}

/** Which channels are used per notification type */
export const NOTIFICATION_CHANNELS: Record<NotificationType, NotificationChannel[]> = {
  [NotificationType.CUSTOMER_REGISTERED]: [NotificationChannel.SMS, NotificationChannel.IN_APP],
  [NotificationType.KYC_APPROVED]: [NotificationChannel.SMS, NotificationChannel.IN_APP],
  [NotificationType.KYC_REJECTED]: [NotificationChannel.SMS, NotificationChannel.IN_APP],
  [NotificationType.ORDER_RECEIVED]: [NotificationChannel.IN_APP],
  [NotificationType.QUOTATION_GENERATED]: [NotificationChannel.IN_APP],
  [NotificationType.REVIEW_STARTED]: [NotificationChannel.IN_APP],
  [NotificationType.TRADE_CONFIRMED]: [NotificationChannel.SMS, NotificationChannel.IN_APP],
  [NotificationType.TRADE_REVERSED]: [NotificationChannel.SMS, NotificationChannel.IN_APP],
  [NotificationType.PAYMENT_RECORDED]: [NotificationChannel.IN_APP],
  [NotificationType.SETTLEMENT_COMPLETED]: [NotificationChannel.SMS, NotificationChannel.IN_APP],
  [NotificationType.INTERNAL_NEW_ORDER]: [NotificationChannel.IN_APP],
  [NotificationType.INTERNAL_ORDER_ASSIGNED]: [NotificationChannel.IN_APP],
  [NotificationType.INTERNAL_PENDING_REVIEW]: [NotificationChannel.IN_APP],
  [NotificationType.INTERNAL_PAYMENT_ISSUE]: [NotificationChannel.IN_APP],
  [NotificationType.INTERNAL_SETTLEMENT_ISSUE]: [NotificationChannel.IN_APP],
  [NotificationType.OTP_LOGIN]: [NotificationChannel.SMS],
};
