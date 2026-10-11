export const ORDER_PROGRESS_STEPS = [
  { id: 'submitted', label: 'ثبت سفارش' },
  { id: 'quoted', label: 'صدور پیش‌فاکتور' },
  { id: 'review', label: 'بررسی طلافروش' },
  { id: 'approved', label: 'تأیید سفارش' },
  { id: 'trade', label: 'ایجاد معامله' },
  { id: 'settled', label: 'تسویه' },
] as const;

export type OrderProgressStepId = (typeof ORDER_PROGRESS_STEPS)[number]['id'];

export type OrderProgress = {
  currentIndex: number;
  remainingLabel: string | null;
  terminal: 'rejected' | 'cancelled' | 'completed' | null;
};

const STATUS_INDEX: Record<string, number> = {
  DRAFT: 0,
  SUBMITTED: 1,
  QUOTED: 2,
  ASSIGNED: 2,
  UNDER_REVIEW: 2,
  REVISION_REQUESTED: 2,
  APPROVED: 3,
  TRADE_CREATED: 4,
  SETTLING: 5,
  COMPLETED: 5,
};

const REMAINING: Record<string, string> = {
  DRAFT: 'سفارش هنوز ارسال نشده است.',
  SUBMITTED: 'پیش‌فاکتور در حال صدور است.',
  QUOTED: 'در انتظار بررسی طلافروش.',
  ASSIGNED: 'سفارش به بررسی‌کننده ارجاع شده است.',
  UNDER_REVIEW: 'طلافروش در حال بررسی سفارش است.',
  REVISION_REQUESTED: 'نیاز به اصلاح دارد؛ پس از اصلاح دوباره بررسی می‌شود.',
  APPROVED: 'سفارش تأیید شد؛ در انتظار ایجاد معامله.',
  TRADE_CREATED: 'معامله ایجاد شد؛ در انتظار تسویه.',
  SETTLING: 'تسویه در حال انجام است.',
};

export function orderProgress(status: string): OrderProgress {
  if (status === 'REJECTED') {
    return { currentIndex: -1, remainingLabel: null, terminal: 'rejected' };
  }
  if (status === 'CANCELLED') {
    return { currentIndex: -1, remainingLabel: null, terminal: 'cancelled' };
  }
  if (status === 'COMPLETED') {
    return { currentIndex: ORDER_PROGRESS_STEPS.length - 1, remainingLabel: null, terminal: 'completed' };
  }
  const currentIndex = STATUS_INDEX[status] ?? 0;
  return {
    currentIndex,
    remainingLabel: REMAINING[status] ?? 'در انتظار مرحله بعد.',
    terminal: null,
  };
}
