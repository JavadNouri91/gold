import { BusinessRuleException } from '../../../../common/exceptions/business-rule.exception';
import Decimal from 'decimal.js';

export class InsufficientPickupGoldException extends BusinessRuleException {
  constructor(available: Decimal, required: Decimal) {
    super(
      'PICKUP_INSUFFICIENT_GOLD',
      'موجودی طلای آبشده برای این درخواست کافی نیست. وزن را کم کنید یا تا آزاد شدن رزرو دیگر صبر کنید.',
      {
        availableGrams: available.toFixed(6),
        requiredGrams: required.toFixed(6),
        shortfallGrams: required.minus(available).toFixed(6),
      },
    );
  }
}

export class InvalidPickupStateTransitionException extends BusinessRuleException {
  constructor(currentStatus: string, attemptedAction: string) {
    super(
      'PICKUP_INVALID_STATE',
      `در وضعیت فعلی (${currentStatus}) امکان «${attemptedAction}» وجود ندارد.`,
      { currentStatus, attemptedAction },
    );
  }
}

export class PickupNotFoundException extends BusinessRuleException {
  constructor(id: string) {
    super('PICKUP_NOT_FOUND', 'درخواست تحویل حضوری پیدا نشد.', { pickupId: id });
  }
}

export class PickupPurityRequiredException extends BusinessRuleException {
  constructor() {
    super(
      'PICKUP_PURITY_REQUIRED',
      'عیار تحویل حضوری باید مشخص شود.',
    );
  }
}

export class CustomerNotEligibleForPickupException extends BusinessRuleException {
  constructor(reason: string) {
    super('PICKUP_CUSTOMER_INELIGIBLE', reason);
  }
}

export class StoreNotConfiguredException extends BusinessRuleException {
  constructor() {
    super(
      'PICKUP_STORE_MISSING',
      'فروشگاه فعالی برای تحویل حضوری تنظیم نشده است. با پشتیبانی تماس بگیرید.',
    );
  }
}

export class InvalidScheduledPickupDateException extends BusinessRuleException {
  constructor(reason: string) {
    super('PICKUP_SCHEDULED_DATE_INVALID', reason);
  }
}
