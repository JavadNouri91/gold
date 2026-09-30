import { NotFoundException, ForbiddenException } from '@nestjs/common';

export class NotificationNotFoundException extends NotFoundException {
  constructor(id: string) {
    super({ code: 'NOTIFICATION_NOT_FOUND', message: `Notification ${id} not found` });
  }
}

export class NotificationAccessDeniedException extends ForbiddenException {
  constructor() {
    super({
      code: 'NOTIFICATION_ACCESS_DENIED',
      message: 'You are not allowed to access this notification',
    });
  }
}

export class NotificationNotRetryableException extends Error {
  constructor(id: string, reason: string) {
    super(`Notification ${id} cannot be retried: ${reason}`);
    this.name = 'NotificationNotRetryableException';
  }
}
