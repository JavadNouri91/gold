import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { NotificationEntity } from '../../domain/entities/notification.entity';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '../../domain/constants/notification-types';
import { inboxWhere, InboxCriteria, INBOX_TYPES, markInboxWhere } from '../../domain/inbox-filter';
import { NotificationRelationDto } from '../../domain/owned-relation';

type PrismaNotification = {
  id: string;
  recipientId: string | null;
  recipientMobile: string | null;
  channel: string;
  type: string;
  subject: string | null;
  body: string;
  status: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  providerReference: string | null;
  retry_count: number;
  max_retries: number;
  sentAt: Date | null;
  failedAt: Date | null;
  errorMessage: string | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private mapRow(row: PrismaNotification): NotificationEntity {
    return new NotificationEntity({
      id: row.id,
      recipientId: row.recipientId,
      recipientMobile: row.recipientMobile,
      channel: row.channel as NotificationChannel,
      type: row.type as NotificationType,
      subject: row.subject,
      body: row.body,
      status: row.status as NotificationStatus,
      relatedEntityType: row.relatedEntityType,
      relatedEntityId: row.relatedEntityId,
      providerReference: row.providerReference,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      sentAt: row.sentAt,
      failedAt: row.failedAt,
      errorMessage: row.errorMessage,
      readAt: row.readAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async create(data: {
    recipientId: string | null;
    recipientMobile: string | null;
    channel: NotificationChannel;
    type: NotificationType;
    subject: string | null;
    body: string;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    maxRetries?: number;
  }): Promise<NotificationEntity> {
    const row = await this.prisma.notification.create({
      data: {
        recipientId: data.recipientId,
        recipientMobile: data.recipientMobile,
        channel: data.channel as never,
        type: data.type as never,
        subject: data.subject,
        body: data.body,
        status: NotificationStatus.PENDING as never,
        relatedEntityType: data.relatedEntityType,
        relatedEntityId: data.relatedEntityId,
        max_retries: data.maxRetries ?? 3,
      },
    });
    return this.mapRow(row as unknown as PrismaNotification);
  }

  async markSent(id: string, providerReference: string): Promise<NotificationEntity> {
    const row = await this.prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.SENT as never,
        sentAt: new Date(),
        providerReference,
      },
    });
    return this.mapRow(row as unknown as PrismaNotification);
  }

  async markFailed(id: string, errorMessage: string): Promise<NotificationEntity> {
    const row = await this.prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.FAILED as never,
        failedAt: new Date(),
        errorMessage,
        retry_count: { increment: 1 },
      },
    });
    return this.mapRow(row as unknown as PrismaNotification);
  }

  async markRetrying(id: string): Promise<NotificationEntity> {
    const row = await this.prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.PENDING as never,
        failedAt: null,
        errorMessage: null,
        retry_count: { increment: 1 },
      },
    });
    return this.mapRow(row as unknown as PrismaNotification);
  }

  async findById(id: string): Promise<NotificationEntity | null> {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    return row ? this.mapRow(row as unknown as PrismaNotification) : null;
  }

  async findByRecipient(
    recipientId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<NotificationEntity[]> {
    const rows = await this.prisma.notification.findMany({
      where: { recipientId },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 50,
      skip: opts.offset ?? 0,
    });
    return rows.map((r) => this.mapRow(r as unknown as PrismaNotification));
  }

  async findInbox(
    recipientId: string,
    criteria: InboxCriteria & { page: number; limit: number; sort: 'newest' | 'oldest' },
  ): Promise<{ items: NotificationEntity[]; total: number }> {
    const where = inboxWhere(recipientId, criteria) as never;
    const skip = (criteria.page - 1) * criteria.limit;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: criteria.sort === 'oldest' ? 'asc' : 'desc' },
        skip,
        take: criteria.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.mapRow(row as unknown as PrismaNotification)),
      total,
    };
  }

  async countSummary(recipientId: string): Promise<{
    unread: number;
    trades: number;
    financial: number;
    kyc: number;
    account: number;
  }> {
    const scope = { recipientId, channel: NotificationChannel.IN_APP as never };
    const [unread, trades, financial, kyc, account] = await Promise.all([
      this.prisma.notification.count({
        where: { ...scope, type: { in: INBOX_TYPES as never }, readAt: null },
      }),
      this.prisma.notification.count({
        where: inboxWhere(recipientId, { read: 'all', category: 'trades' }) as never,
      }),
      this.prisma.notification.count({
        where: inboxWhere(recipientId, { read: 'all', category: 'financial' }) as never,
      }),
      this.prisma.notification.count({
        where: inboxWhere(recipientId, { read: 'all', category: 'kyc' }) as never,
      }),
      this.prisma.notification.count({
        where: inboxWhere(recipientId, { read: 'all', category: 'account' }) as never,
      }),
    ]);
    return { unread, trades, financial, kyc, account };
  }

  /** Sets readAt when the row belongs to this recipient. Returns null when it does not. */
  async markRead(recipientId: string, id: string): Promise<NotificationEntity | null> {
    const existing = await this.prisma.notification.findFirst({
      where: {
        id,
        recipientId,
        channel: NotificationChannel.IN_APP as never,
        type: { in: INBOX_TYPES as never },
      },
    });
    if (!existing) return null;
    if (existing.readAt) return this.mapRow(existing as unknown as PrismaNotification);
    const row = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return this.mapRow(row as unknown as PrismaNotification);
  }

  async markReadMany(recipientId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.prisma.notification.updateMany({
      where: markInboxWhere(recipientId, ids) as never,
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async markAllRead(recipientId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: markInboxWhere(recipientId) as never,
      data: { readAt: new Date() },
    });
    return result.count;
  }

  /**
   * Public summary of the linked record, only when that record belongs to
   * the notification recipient's customer. A miss returns null (no leak).
   */
  async resolveRelation(
    recipientUserId: string | null,
    entityType: string | null,
    entityId: string | null,
  ): Promise<NotificationRelationDto | null> {
    if (!recipientUserId || !entityType || !entityId) return null;
    const customer = await this.prisma.customer.findUnique({
      where: { userId: recipientUserId },
      select: { id: true },
    });
    if (!customer) return null;

    if (entityType === 'Order') {
      const order = await this.prisma.order.findFirst({
        where: { id: entityId, customerId: customer.id },
        select: {
          id: true,
          orderNumber: true,
          weightGrams: true,
          status: true,
          totalAmountRial: true,
        },
      });
      if (!order) return null;
      return {
        kind: 'order',
        href: `/portal/orders/${order.id}`,
        number: order.orderNumber,
        amountRial: order.totalAmountRial.toFixed(2),
        weightGrams: order.weightGrams.toString(),
        status: String(order.status),
        referenceNumber: null,
      };
    }

    if (entityType === 'Trade') {
      const trade = await this.prisma.trade.findFirst({
        where: { id: entityId, customerId: customer.id },
        select: {
          id: true,
          tradeNumber: true,
          weightGrams: true,
          status: true,
          totalAmountRial: true,
        },
      });
      if (!trade) return null;
      return {
        kind: 'trade',
        href: `/portal/trades/${trade.id}`,
        number: trade.tradeNumber,
        amountRial: trade.totalAmountRial.toFixed(2),
        weightGrams: trade.weightGrams.toString(),
        status: String(trade.status),
        referenceNumber: null,
      };
    }

    if (entityType === 'Payment') {
      const payment = await this.prisma.payment.findFirst({
        where: { id: entityId, customerId: customer.id },
        select: {
          amount: true,
          status: true,
          referenceNumber: true,
          trade: { select: { id: true, customerId: true, tradeNumber: true } },
        },
      });
      if (!payment) return null;
      const ownsTrade = payment.trade.customerId === customer.id;
      return {
        kind: 'payment',
        href: ownsTrade ? `/portal/trades/${payment.trade.id}` : '/portal/payments',
        number: ownsTrade ? payment.trade.tradeNumber : null,
        amountRial: payment.amount.toFixed(2),
        weightGrams: null,
        status: String(payment.status),
        referenceNumber: payment.referenceNumber,
      };
    }

    if (entityType === 'Quotation') {
      const quotation = await this.prisma.quotation.findFirst({
        where: { id: entityId, customerId: customer.id },
        select: {
          id: true,
          quotationNumber: true,
          weightGrams: true,
          status: true,
          totalAmountRial: true,
        },
      });
      if (!quotation) return null;
      return {
        kind: 'quotation',
        href: `/portal/quotations/${quotation.id}`,
        number: quotation.quotationNumber,
        amountRial: quotation.totalAmountRial.toFixed(2),
        weightGrams: quotation.weightGrams.toString(),
        status: String(quotation.status),
        referenceNumber: null,
      };
    }

    if (entityType === 'KYCVerification') {
      const verification = await this.prisma.kYCVerification.findFirst({
        where: { id: entityId, customerId: customer.id },
        select: { status: true },
      });
      if (!verification) return null;
      return {
        kind: 'kyc',
        href: '/portal/kyc',
        number: null,
        amountRial: null,
        weightGrams: null,
        status: String(verification.status),
        referenceNumber: null,
      };
    }

    if (entityType === 'Settlement') {
      const settlement = await this.prisma.settlement.findFirst({
        where: { id: entityId, trade: { customerId: customer.id } },
        select: {
          status: true,
          settledAmount: true,
          trade: { select: { id: true, tradeNumber: true } },
        },
      });
      if (!settlement) return null;
      return {
        kind: 'settlement',
        href: `/portal/trades/${settlement.trade.id}`,
        number: settlement.trade.tradeNumber,
        amountRial: settlement.settledAmount.toFixed(2),
        weightGrams: null,
        status: String(settlement.status),
        referenceNumber: null,
      };
    }

    return null;
  }

  async findRetryable(limit = 50): Promise<NotificationEntity[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        status: NotificationStatus.FAILED as never,
        // Only retry if retryCount < maxRetries (raw filter approximation)
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows
      .map((r) => this.mapRow(r as unknown as PrismaNotification))
      .filter((n) => n.canRetry());
  }
}
