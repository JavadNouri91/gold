import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '../../domain/constants/notification-types';
import { NotificationRelationDto } from '../../domain/owned-relation';

export type { NotificationRelationDto };

export class NotificationResponseDto {
  id: string;
  recipientId: string | null;
  channel: NotificationChannel;
  type: NotificationType;
  subject: string | null;
  body: string;
  status: NotificationStatus;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  retryCount: number;
  sentAt: string | null;
  failedAt: string | null;
  readAt: string | null;
  createdAt: string;

  // NOTE: providerReference, errorMessage, recipientMobile are EXCLUDED from customer-facing DTOs
  // Staff endpoints expose extended info via NotificationAdminResponseDto

  static fromEntity(e: {
    id: string;
    recipientId: string | null;
    channel: NotificationChannel;
    type: NotificationType;
    subject: string | null;
    body: string;
    status: NotificationStatus;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    retryCount: number;
    sentAt: Date | null;
    failedAt: Date | null;
    readAt: Date | null;
    createdAt: Date;
  }): NotificationResponseDto {
    const dto = new NotificationResponseDto();
    dto.id = e.id;
    dto.recipientId = e.recipientId;
    dto.channel = e.channel;
    dto.type = e.type;
    dto.subject = e.subject;
    dto.body = e.body;
    dto.status = e.status;
    dto.relatedEntityType = e.relatedEntityType;
    dto.relatedEntityId = e.relatedEntityId;
    dto.retryCount = e.retryCount;
    dto.sentAt = e.sentAt?.toISOString() ?? null;
    dto.failedAt = e.failedAt?.toISOString() ?? null;
    dto.readAt = e.readAt?.toISOString() ?? null;
    dto.createdAt = e.createdAt.toISOString();
    return dto;
  }
}

export class NotificationDetailResponseDto extends NotificationResponseDto {
  relation: NotificationRelationDto | null = null;

  static fromDetail(
    entity: Parameters<typeof NotificationResponseDto.fromEntity>[0],
    relation: NotificationRelationDto | null,
  ): NotificationDetailResponseDto {
    const dto = Object.assign(
      new NotificationDetailResponseDto(),
      NotificationResponseDto.fromEntity(entity),
    );
    dto.relation = relation;
    return dto;
  }
}

export class NotificationAdminResponseDto extends NotificationResponseDto {
  providerReference: string | null;
  errorMessage: string | null;
  maxRetries: number;
  canRetry: boolean;

  static fromEntityAdmin(e: {
    id: string;
    recipientId: string | null;
    channel: NotificationChannel;
    type: NotificationType;
    subject: string | null;
    body: string;
    status: NotificationStatus;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    retryCount: number;
    maxRetries: number;
    sentAt: Date | null;
    failedAt: Date | null;
    readAt: Date | null;
    errorMessage: string | null;
    providerReference: string | null;
    createdAt: Date;
    canRetry(): boolean;
  }): NotificationAdminResponseDto {
    const dto = new NotificationAdminResponseDto();
    dto.id = e.id;
    dto.recipientId = e.recipientId;
    dto.channel = e.channel;
    dto.type = e.type;
    dto.subject = e.subject;
    dto.body = e.body;
    dto.status = e.status;
    dto.relatedEntityType = e.relatedEntityType;
    dto.relatedEntityId = e.relatedEntityId;
    dto.retryCount = e.retryCount;
    dto.maxRetries = e.maxRetries;
    dto.providerReference = e.providerReference;
    dto.errorMessage = e.errorMessage;
    dto.sentAt = e.sentAt?.toISOString() ?? null;
    dto.failedAt = e.failedAt?.toISOString() ?? null;
    dto.readAt = e.readAt?.toISOString() ?? null;
    dto.createdAt = e.createdAt.toISOString();
    dto.canRetry = e.canRetry();
    return dto;
  }
}
