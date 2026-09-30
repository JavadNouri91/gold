import { ApiClientError } from '@/lib/api';

export function purchaseErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ApiClientError)) return fallback;
  switch (err.code) {
    case 'NO_PRICE_AVAILABLE':
    case 'PRICE_PROVIDER_UNAVAILABLE':
    case 'INVALID_PRICE_RESPONSE':
      return 'قیمت لحظه‌ای در دسترس نیست.';
    case 'STALE_PRICE_SNAPSHOT':
      return 'قیمت سفارش منقضی شده است.';
    case 'ORDER_INSUFFICIENT_CREDIT':
      return 'اعتبار کافی برای ثبت این سفارش ندارید.';
    case 'INVALID_WEIGHT':
      return 'وزن واردشده معتبر نیست.';
    case 'INVALID_PURITY':
      return 'عیار انتخاب‌شده معتبر نیست.';
    case 'ORDER_CUSTOMER_NOT_ELIGIBLE': {
      const text = err.message.toLowerCase();
      if (text.includes('weight')) return 'وزن واردشده معتبر نیست.';
      if (text.includes('purity')) return 'عیار انتخاب‌شده معتبر نیست.';
      return 'احراز هویت شما تکمیل نشده است.';
    }
    default:
      return fallback;
  }
}
