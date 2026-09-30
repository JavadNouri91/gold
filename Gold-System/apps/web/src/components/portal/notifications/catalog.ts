import type { LucideIcon } from 'lucide-react';
import { BadgeCheck, ShoppingCart, UserRound, Wallet } from 'lucide-react';
import type { Notification, NotificationCategory, NotificationRelation } from '@/lib/api';
import { tehranCivilDate } from '@/lib/activity-range';
import {
  formatDate,
  formatTime,
  KYC_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  QUOTATION_STATUS_LABELS,
  SETTLEMENT_STATUS_LABELS,
  TRADE_STATUS_LABELS,
} from '@/lib/utils';

export const CATEGORY_META: Record<
  NotificationCategory,
  { label: string; short: string; icon: LucideIcon; tile: string; iconColor: string }
> = {
  trades: {
    label: 'معاملات',
    short: 'معاملات',
    icon: ShoppingCart,
    tile: 'bg-[#FBF6EB]',
    iconColor: 'text-[#C8922E]',
  },
  financial: {
    label: 'مالی و پرداخت',
    short: 'مالی',
    icon: Wallet,
    tile: 'bg-green-50',
    iconColor: 'text-[#16A34A]',
  },
  kyc: {
    label: 'احراز هویت',
    short: 'احراز هویت',
    icon: BadgeCheck,
    tile: 'bg-violet-50',
    iconColor: 'text-[#7C3AED]',
  },
  account: {
    label: 'حساب',
    short: 'حساب',
    icon: UserRound,
    tile: 'bg-slate-100',
    iconColor: 'text-[#6B7280]',
  },
};

const TYPE_CATEGORY: Record<string, NotificationCategory> = {
  ORDER_RECEIVED: 'trades',
  QUOTATION_GENERATED: 'trades',
  REVIEW_STARTED: 'trades',
  TRADE_CONFIRMED: 'trades',
  TRADE_REVERSED: 'trades',
  PAYMENT_RECORDED: 'financial',
  SETTLEMENT_COMPLETED: 'financial',
  KYC_APPROVED: 'kyc',
  KYC_REJECTED: 'kyc',
  CUSTOMER_REGISTERED: 'account',
};

const TYPE_LABELS: Record<string, string> = {
  ORDER_RECEIVED: 'سفارش شما ثبت شد',
  QUOTATION_GENERATED: 'پیش‌فاکتور صادر شد',
  REVIEW_STARTED: 'بررسی سفارش آغاز شد',
  TRADE_CONFIRMED: 'معامله تأیید شد',
  TRADE_REVERSED: 'معامله برگشت شد',
  PAYMENT_RECORDED: 'پرداخت ثبت شد',
  SETTLEMENT_COMPLETED: 'تسویه کامل شد',
  KYC_APPROVED: 'احراز هویت تأیید شد',
  KYC_REJECTED: 'احراز هویت رد شد',
  CUSTOMER_REGISTERED: 'حساب شما ثبت شد',
};

export function categoryOf(type: string): NotificationCategory {
  return TYPE_CATEGORY[type] ?? 'account';
}

export function notificationTitle(item: Pick<Notification, 'type' | 'subject'>): string {
  const subject = item.subject?.trim();
  return subject || TYPE_LABELS[item.type] || 'اعلان سامانه';
}

export function categoryLabel(type: string): string {
  return CATEGORY_META[categoryOf(type)].label;
}

export function entityActionLabel(entityType: string | null): string {
  switch (entityType) {
    case 'Order':
      return 'مشاهده سفارش';
    case 'Trade':
    case 'Settlement':
      return 'مشاهده معامله';
    case 'Payment':
      return 'مشاهده پرداخت';
    case 'Quotation':
      return 'مشاهده پیش‌فاکتور';
    case 'KYCVerification':
      return 'مشاهده احراز هویت';
    default:
      return 'جزئیات';
  }
}

export function relationActionLabel(kind: NotificationRelation['kind']): string {
  switch (kind) {
    case 'order':
      return 'مشاهده سفارش';
    case 'trade':
    case 'settlement':
      return 'مشاهده معامله';
    case 'payment':
      return 'مشاهده پرداخت';
    case 'quotation':
      return 'مشاهده پیش‌فاکتور';
    case 'kyc':
      return 'مشاهده احراز هویت';
  }
}

export function relationNumberLabel(kind: NotificationRelation['kind']): string {
  switch (kind) {
    case 'order':
      return 'شماره سفارش';
    case 'quotation':
      return 'شماره پیش‌فاکتور';
    case 'payment':
    case 'trade':
    case 'settlement':
      return 'شماره معامله';
    default:
      return '';
  }
}

export function relationStatusLabel(relation: NotificationRelation): string | null {
  if (!relation.status) return null;
  const map = {
    order: ORDER_STATUS_LABELS,
    trade: TRADE_STATUS_LABELS,
    payment: PAYMENT_STATUS_LABELS,
    quotation: QUOTATION_STATUS_LABELS,
    kyc: KYC_STATUS_LABELS,
    settlement: SETTLEMENT_STATUS_LABELS,
  }[relation.kind];
  return map[relation.status] ?? relation.status;
}

function shiftCivilDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  const nextMonth = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const nextDay = String(shifted.getUTCDate()).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${nextMonth}-${nextDay}`;
}

export function notificationDayKey(iso: string): string {
  return tehranCivilDate(new Date(iso));
}

export function notificationDayLabel(iso: string, now = new Date()): string {
  const key = notificationDayKey(iso);
  const today = tehranCivilDate(now);
  if (key === today) return 'امروز';
  if (key === shiftCivilDate(today, -1)) return 'دیروز';
  return formatDate(iso);
}

export function notificationStamp(iso: string, now = new Date()): string {
  return `${notificationDayLabel(iso, now)}، ${formatTime(iso)}`;
}

export function groupByDay<T extends { createdAt: string }>(items: T[], now = new Date()) {
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const key = notificationDayKey(item.createdAt);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: notificationDayLabel(item.createdAt, now), items: [item] });
  }
  return groups;
}
