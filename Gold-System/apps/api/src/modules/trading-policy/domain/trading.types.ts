import Decimal from 'decimal.js';

export const TRADING_WEEKDAYS = [
  'SATURDAY',
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
] as const;

export type TradingWeekday = (typeof TRADING_WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<TradingWeekday, string> = {
  SATURDAY: 'شنبه',
  SUNDAY: 'یکشنبه',
  MONDAY: 'دوشنبه',
  TUESDAY: 'سه‌شنبه',
  WEDNESDAY: 'چهارشنبه',
  THURSDAY: 'پنجشنبه',
  FRIDAY: 'جمعه',
};

export type TradingOverrideKind = 'FULL_CLOSURE' | 'SPECIAL_SCHEDULE';

export type TradingLimitScope = 'GLOBAL' | 'ROLE' | 'USER' | 'CUSTOMER' | 'TRANSACTION_TYPE';

export type TradingStatus = 'فعال' | 'شروع نشده' | 'پایان یافته' | 'تعطیل' | 'محدودیت تکمیل شده';

export const TRADING_MESSAGES = {
  closed: 'زمان معاملات در حال حاضر فعال نیست.',
  holiday: 'امروز معاملات تعطیل است.',
  amount: 'سقف ریالی معاملات این بازه تکمیل شده است.',
  weight: 'سقف وزن طلای این بازه تکمیل شده است.',
  count: 'سقف تعداد معاملات این بازه تکمیل شده است.',
  overlap: 'این بازه با بازه دیگری در همان روز هم‌پوشانی دارد.',
  timeRange: 'زمان پایان باید بعد از زمان شروع باشد.',
  negative: 'مقادیر محدودیت نمی‌توانند منفی باشند.',
  requiredLimit: 'حداقل یکی از سقف‌ها باید تعیین شود.',
  invalidNumber: 'مقدار عددی نامعتبر است.',
  invalidTime: 'زمان وارد شده نامعتبر است.',
  amountMin: 'مبلغ این معامله کمتر از حداقل مجاز این بازه است.',
  amountMax: 'مبلغ این معامله از حداکثر مجاز این بازه بیشتر است.',
  weightMin: 'وزن این معامله کمتر از حداقل مجاز این بازه است.',
  weightMax: 'وزن این معامله از حداکثر مجاز این بازه بیشتر است.',
  amountOrder: 'حداقل مبلغ نمی‌تواند بیشتر از حداکثر مبلغ باشد.',
  weightOrder: 'حداقل وزن نمی‌تواند بیشتر از حداکثر وزن باشد.',
} as const;

export interface CapFields {
  maxAmountRial: Decimal | null;
  minAmountRial: Decimal | null;
  maxWeightGrams: Decimal | null;
  minWeightGrams: Decimal | null;
  maxCount: number | null;
  maxSingleAmountRial: Decimal | null;
  maxSingleWeightGrams: Decimal | null;
}

export interface SessionView extends CapFields {
  id: string;
  weekday: TradingWeekday | null;
  dayOverrideId: string | null;
  title: string;
  startMinute: number;
  endMinute: number;
  enabled: boolean;
  sortOrder: number;
}

export interface OverrideView {
  id: string;
  date: string;
  kind: TradingOverrideKind;
  title: string;
  enabled: boolean;
  sessions: SessionView[];
}

export interface LimitView extends CapFields {
  id: string;
  scope: TradingLimitScope;
  scopeKey: string | null;
  sessionId: string | null;
  enabled: boolean;
}

export interface Usage {
  count: number;
  amountRial: Decimal;
  weightGrams: Decimal;
}

export interface LimitContext {
  roleIds?: string[];
  userId?: string;
  customerId?: string;
  transactionType?: string;
}

export const EMPTY_USAGE: Usage = {
  count: 0,
  amountRial: new Decimal(0),
  weightGrams: new Decimal(0),
};
