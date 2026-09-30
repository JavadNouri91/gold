import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '../constants/notification-types';

export class NotificationEntity {
  readonly id: string;
  readonly recipientId: string | null;
  readonly recipientMobile: string | null;
  readonly channel: NotificationChannel;
  readonly type: NotificationType;
  readonly subject: string | null;
  readonly body: string;
  readonly status: NotificationStatus;
  readonly relatedEntityType: string | null;
  readonly relatedEntityId: string | null;
  readonly providerReference: string | null;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly sentAt: Date | null;
  readonly failedAt: Date | null;
  readonly errorMessage: string | null;
  readonly readAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(data: {
    id: string;
    recipientId: string | null;
    recipientMobile: string | null;
    channel: NotificationChannel;
    type: NotificationType;
    subject: string | null;
    body: string;
    status: NotificationStatus;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    providerReference: string | null;
    retryCount: number;
    maxRetries: number;
    sentAt: Date | null;
    failedAt: Date | null;
    errorMessage: string | null;
    readAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = data.id;
    this.recipientId = data.recipientId;
    this.recipientMobile = data.recipientMobile;
    this.channel = data.channel;
    this.type = data.type;
    this.subject = data.subject;
    this.body = data.body;
    this.status = data.status;
    this.relatedEntityType = data.relatedEntityType;
    this.relatedEntityId = data.relatedEntityId;
    this.providerReference = data.providerReference;
    this.retryCount = data.retryCount;
    this.maxRetries = data.maxRetries;
    this.sentAt = data.sentAt;
    this.failedAt = data.failedAt;
    this.errorMessage = data.errorMessage;
    this.readAt = data.readAt;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  isPending(): boolean {
    return this.status === NotificationStatus.PENDING;
  }

  isSent(): boolean {
    return this.status === NotificationStatus.SENT;
  }

  isFailed(): boolean {
    return this.status === NotificationStatus.FAILED;
  }

  canRetry(): boolean {
    return this.status === NotificationStatus.FAILED && this.retryCount < this.maxRetries;
  }

  isRead(): boolean {
    return this.readAt !== null;
  }
}
