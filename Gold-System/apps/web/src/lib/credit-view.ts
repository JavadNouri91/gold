import type { CreditLedgerEntry, CustomerAccount } from '@/lib/api';
import {
  compareDecimal,
  decimalUnits,
  isZeroDecimal,
  percentOfDecimal,
  subtractDecimal,
} from '@/lib/decimal-string';

export interface CreditStatusView {
  label: string;
  tone: 'green' | 'amber' | 'red' | 'blue';
}

export interface CreditGoldView {
  limit: string;
  reserved: string;
  consumed: string;
}

export interface CreditFigures {
  limit: string;
  available: string;
  reserved: string;
  consumed: string;
  availablePercent: number | null;
  reservedPercent: number | null;
  consumedPercent: number | null;
  usedPercent: number | null;
  updatedAt: string | null;
  status: CreditStatusView;
  gold: CreditGoldView | null;
}

/** Prefer the server available balance. Do not recompute it from the buckets. */
export function readAvailableCredit(account: CustomerAccount): string | null {
  const value = account.availableRial ?? account.availableCreditRial;
  if (value == null || String(value).trim() === '') return null;
  return String(value);
}

export function creditStatusView(status: string): CreditStatusView {
  switch (status) {
    case 'ACTIVE':
      return { label: 'مجاز', tone: 'green' };
    case 'INACTIVE':
      return { label: 'محدود شده', tone: 'amber' };
    case 'BLOCKED':
    case 'SUSPENDED':
      return { label: 'تعلیق شده', tone: 'red' };
    case 'PENDING':
    case 'UNDER_REVIEW':
      return { label: 'در انتظار بررسی', tone: 'blue' };
    default:
      return { label: 'نامشخص', tone: 'amber' };
  }
}

export function selectCreditFigures(account: CustomerAccount): CreditFigures | null {
  const available = readAvailableCredit(account);
  if (!available) return null;
  const limit = account.creditLimitRial;
  let used: string;
  try {
    used = subtractDecimal(limit, available);
  } catch {
    return null;
  }
  const goldLimit = account.creditLimitGoldRial;
  let gold: CreditGoldView | null = null;
  try {
    if (compareDecimal(goldLimit, '0') > 0) {
      gold = {
        limit: goldLimit,
        reserved: account.reservedCreditGoldRial,
        consumed: account.consumedCreditGoldRial,
      };
    }
  } catch {
    gold = null;
  }
  return {
    limit,
    available,
    reserved: account.reservedCreditRial,
    consumed: account.consumedCreditRial,
    availablePercent: percentOfDecimal(available, limit),
    reservedPercent: percentOfDecimal(account.reservedCreditRial, limit),
    consumedPercent: percentOfDecimal(account.consumedCreditRial, limit),
    usedPercent: percentOfDecimal(used, limit),
    updatedAt: account.updatedAt ?? null,
    status: creditStatusView(account.status),
    gold,
  };
}

export function isCreditInactive(figures: CreditFigures): boolean {
  return (
    isZeroDecimal(figures.limit) &&
    isZeroDecimal(figures.available) &&
    isZeroDecimal(figures.reserved) &&
    isZeroDecimal(figures.consumed)
  );
}

export type CreditOrderKind = 'reserved' | 'pending' | 'consumed' | 'released' | 'cancelled';

const RESERVED_ORDER_STATUSES = new Set(['SUBMITTED', 'QUOTED', 'ASSIGNED', 'REVISION_REQUESTED']);
const PENDING_ORDER_STATUSES = new Set(['UNDER_REVIEW', 'APPROVED']);
const CONSUMED_ORDER_STATUSES = new Set(['TRADE_CREATED', 'SETTLING', 'COMPLETED']);

export interface CreditOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  totalAmountRial: string;
  weightGrams: string;
  reservedAmountRial: string | null;
  createdAt: string;
  submittedAt?: string | null;
  side?: 'BUY' | 'SELL' | null;
}

export function creditOrderKind(
  order: Pick<CreditOrderRow, 'status' | 'reservedAmountRial'>,
): CreditOrderKind | null {
  const reserved = order.reservedAmountRial != null && !isZeroDecimal(order.reservedAmountRial);
  if (RESERVED_ORDER_STATUSES.has(order.status) && reserved) return 'reserved';
  if (PENDING_ORDER_STATUSES.has(order.status) && reserved) return 'pending';
  if (CONSUMED_ORDER_STATUSES.has(order.status)) return 'consumed';
  if (order.status === 'REJECTED' && reserved) return 'released';
  if (order.status === 'CANCELLED' && reserved) return 'cancelled';
  return null;
}

export const CREDIT_ORDER_KIND_LABEL: Record<CreditOrderKind, string> = {
  reserved: 'رزرو شده',
  pending: 'در انتظار تأیید',
  consumed: 'مصرف شده',
  released: 'آزاد شده',
  cancelled: 'لغو شده',
};

export function creditOrders(orders: CreditOrderRow[]): CreditOrderRow[] {
  return orders.filter((order) => creditOrderKind(order) != null);
}

export function creditOrderSideLabel(side: CreditOrderRow['side']): string {
  if (side === 'BUY') return 'خرید';
  if (side === 'SELL') return 'فروش';
  return 'طلای آبشده';
}

const HISTORY_TITLE: Record<string, string> = {
  GRANT: 'افزایش سقف اعتبار',
  INCREASE: 'افزایش سقف اعتبار',
  DECREASE: 'کاهش سقف اعتبار',
  CONSUME: 'مصرف اعتبار',
  RELEASE: 'آزادسازی اعتبار',
  EXPIRE: 'انقضای اعتبار',
  ADJUSTMENT: 'تعدیل اعتبار',
  REVERSAL: 'برگشت اعتبار',
  RESERVATION: 'رزرو اعتبار',
};

const HISTORY_DESCRIPTION: Record<string, string> = {
  GRANT: 'سقف اعتبار حساب افزایش یافت',
  INCREASE: 'سقف اعتبار حساب افزایش یافت',
  DECREASE: 'سقف اعتبار حساب کاهش یافت',
  CONSUME: 'اعتبار پس از تأیید معامله مصرف شد',
  RELEASE: 'اعتبار رزروشده آزاد شد',
  EXPIRE: 'بخشی از اعتبار منقضی شد',
  ADJUSTMENT: 'اعتبار حساب تعدیل شد',
  REVERSAL: 'اعتبار مصرف‌شده برگشت داده شد',
  RESERVATION: 'ثبت سفارش',
};

const LIMIT_BALANCE_TYPES = new Set(['GRANT', 'INCREASE', 'DECREASE']);
const MINUS_AMOUNT_TYPES = new Set(['DECREASE', 'CONSUME', 'EXPIRE']);

export interface CreditHistoryView {
  id: string;
  title: string;
  description: string;
  amount: string;
  tone: 'plus' | 'minus' | 'neutral';
  balance: string;
  balanceCaption: string;
  createdAt: string;
}

export function presentCreditHistory(
  entry: CreditLedgerEntry,
  orderNumber?: string,
): CreditHistoryView {
  const title = HISTORY_TITLE[entry.type] ?? 'تغییر اعتبار';
  let description = HISTORY_DESCRIPTION[entry.type] ?? 'تغییر در اعتبار حساب';
  if (orderNumber) description = `${description} ${orderNumber}`;
  if (entry.creditPool === 'GOLD_RIAL') description = `${description} (اعتبار طلایی)`;
  const tone = MINUS_AMOUNT_TYPES.has(entry.type)
    ? 'minus'
    : entry.type === 'ADJUSTMENT'
      ? 'neutral'
      : 'plus';
  return {
    id: entry.id,
    title,
    description,
    amount: entry.amount,
    tone,
    balance: entry.balanceAfter,
    balanceCaption: LIMIT_BALANCE_TYPES.has(entry.type) ? 'سقف اعتبار' : 'موجودی اعتبار',
    createdAt: entry.createdAt,
  };
}

export function orderNumberForEntry(
  entry: CreditLedgerEntry,
  orders: Array<Pick<CreditOrderRow, 'id' | 'orderNumber'>>,
): string | undefined {
  if (entry.sourceType !== 'ORDER' || !entry.sourceId) return undefined;
  return orders.find((order) => order.id === entry.sourceId)?.orderNumber;
}

export function creditBarShares(
  point: { available: string; reserved: string; consumed: string },
  maxUnits: bigint,
): { available: number; reserved: number; consumed: number } {
  if (maxUnits <= BigInt(0)) return { available: 0, reserved: 0, consumed: 0 };
  const share = (value: string) => {
    const units = decimalUnits(value) ?? BigInt(0);
    const safe = units > BigInt(0) ? units : BigInt(0);
    return Number((safe * BigInt(10000)) / maxUnits) / 100;
  };
  return {
    available: share(point.available),
    reserved: share(point.reserved),
    consumed: share(point.consumed),
  };
}

export function maxCreditBarUnits(
  points: Array<{ available: string; reserved: string; consumed: string }>,
): bigint {
  let max = BigInt(0);
  for (const point of points) {
    const sum =
      (decimalUnits(point.available) ?? BigInt(0)) +
      (decimalUnits(point.reserved) ?? BigInt(0)) +
      (decimalUnits(point.consumed) ?? BigInt(0));
    if (sum > max) max = sum;
  }
  return max;
}
