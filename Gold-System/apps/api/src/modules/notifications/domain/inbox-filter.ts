import { NotificationChannel, NotificationType } from './constants/notification-types';

/** Customer inbox categories. Only types that already exist in the domain. */
export type InboxCategory = 'trades' | 'financial' | 'kyc' | 'account';

export const INBOX_TYPES: NotificationType[] = [
  NotificationType.CUSTOMER_REGISTERED,
  NotificationType.KYC_APPROVED,
  NotificationType.KYC_REJECTED,
  NotificationType.ORDER_RECEIVED,
  NotificationType.QUOTATION_GENERATED,
  NotificationType.REVIEW_STARTED,
  NotificationType.TRADE_CONFIRMED,
  NotificationType.TRADE_REVERSED,
  NotificationType.PAYMENT_RECORDED,
  NotificationType.SETTLEMENT_COMPLETED,
];

export const INBOX_CATEGORY_TYPES: Record<InboxCategory, NotificationType[]> = {
  trades: [
    NotificationType.ORDER_RECEIVED,
    NotificationType.QUOTATION_GENERATED,
    NotificationType.REVIEW_STARTED,
    NotificationType.TRADE_CONFIRMED,
    NotificationType.TRADE_REVERSED,
  ],
  financial: [NotificationType.PAYMENT_RECORDED, NotificationType.SETTLEMENT_COMPLETED],
  kyc: [NotificationType.KYC_APPROVED, NotificationType.KYC_REJECTED],
  account: [NotificationType.CUSTOMER_REGISTERED],
};

export interface InboxCriteria {
  read: 'all' | 'unread' | 'read';
  category?: InboxCategory;
  q?: string;
  from?: Date;
  to?: Date;
}

/** Recipient comes from the authenticated actor, never from the client body. */
export function inboxWhere(recipientId: string, criteria: InboxCriteria) {
  const types = criteria.category ? INBOX_CATEGORY_TYPES[criteria.category] : INBOX_TYPES;
  const where: Record<string, unknown> = {
    recipientId,
    channel: NotificationChannel.IN_APP,
    type: { in: types },
  };

  if (criteria.read === 'unread') where.readAt = null;
  if (criteria.read === 'read') where.readAt = { not: null };

  if (criteria.from || criteria.to) {
    where.createdAt = {
      ...(criteria.from ? { gte: criteria.from } : {}),
      ...(criteria.to ? { lte: criteria.to } : {}),
    };
  }

  if (criteria.q) {
    where.OR = [
      { subject: { contains: criteria.q, mode: 'insensitive' } },
      { body: { contains: criteria.q, mode: 'insensitive' } },
    ];
  }

  return where;
}

/** Marks unread inbox rows. Extra ids that belong to someone else never match. */
export function markInboxWhere(recipientId: string, ids?: string[]) {
  return {
    recipientId,
    channel: NotificationChannel.IN_APP,
    type: { in: INBOX_TYPES },
    readAt: null,
    ...(ids ? { id: { in: ids } } : {}),
  };
}
