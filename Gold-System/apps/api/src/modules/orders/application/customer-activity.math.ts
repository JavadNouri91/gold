import Decimal from 'decimal.js';

/**
 * Customer transaction analytics.
 *
 * Money and weight are summed with Decimal. This module does not price gold
 * and does not compute customer profit or loss.
 *
 * profitAmount on a Trade is the dealer's margin and is blocked (§13.2).
 * There is no canonical realized/unrealized customer P/L service, so `pnl`
 * stays unsupported.
 *
 * Buy and sell are taken only from the side stored when the order was created.
 * Orders without a side stay unclassified. They are part of volume, and they
 * are not relabeled as خرید or فروش.
 *
 * Booked volume excludes drafts, cancellations, rejections, and reversed trades.
 * Those rows can still appear in the list. An explicit status filter counts
 * only that status, including a cancelled one the customer asked to inspect.
 */

export type OrderSide = 'BUY' | 'SELL';
export type ActivityBucket = 'week' | 'month' | 'quarter' | 'year';

export interface ActivityTradeSnapshot {
  id: string;
  tradeNumber: string;
  status: string;
  totalAmountRial: string;
  weightGrams: string;
  unitPriceRial: string;
  wageAmount: string | null;
  taxAmount: string | null;
  confirmedAt: string | null;
  quotationId: string | null;
}

export interface ActivityOrderInput {
  id: string;
  orderNumber: string;
  status: string;
  totalAmountRial: string;
  weightGrams: string;
  purityRatio: string;
  unitPriceRial: string | null;
  side: OrderSide | null;
  createdAt: Date;
  submittedAt: string | null;
  reservedAmountRial: string | null;
  trade: ActivityTradeSnapshot | null;
  quotationId: string | null;
  quotationNumber: string | null;
  paymentMethods: string[];
  settlementStatus: string | null;
}

export interface ActivityQuery {
  side?: OrderSide;
  status?: string;
  purityRatio?: string;
  q?: string;
  bucket: ActivityBucket;
  page: number;
  limit: number;
}

export interface SideTotal {
  amountRial: string;
  grams: string;
  count: number;
}

export interface ActivitySegment {
  id: 'BUY' | 'SELL' | 'UNCLASSIFIED';
  grams: string;
  share: string;
}

export interface ActivitySeriesPoint {
  key: string;
  buyGrams: string;
  sellGrams: string;
  unclassifiedGrams: string;
}

export interface ActivityTransaction {
  id: string;
  orderNumber: string;
  side: OrderSide | null;
  status: string;
  weightGrams: string;
  purityRatio: string;
  unitPriceRial: string | null;
  totalAmountRial: string;
  createdAt: string;
  submittedAt: string | null;
  confirmedAt: string | null;
  reservedAmountRial: string | null;
  countsTowardVolume: boolean;
  tradeId: string | null;
  tradeNumber: string | null;
  quotationId: string | null;
  quotationNumber: string | null;
  wageAmount: string | null;
  taxAmount: string | null;
  paymentMethods: string[];
  settlementStatus: string | null;
}

export interface ActivityComputation {
  pnl: {
    supported: false;
    realizedRial: null;
    unrealizedRial: null;
    totalRial: null;
    changePercent: null;
  };
  volume: { grams: string; count: number; unit: 'GRAM' };
  buy: SideTotal;
  sell: SideTotal;
  unclassified: SideTotal;
  distribution: { unit: 'GRAM'; segments: ActivitySegment[] };
  series: ActivitySeriesPoint[];
  purities: string[];
  excludedCount: number;
  totalsBasis: 'booked' | 'status-filter';
  transactions: ActivityTransaction[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

const NON_BOOKED_ORDER = new Set(['DRAFT', 'CANCELLED', 'REJECTED']);
const NON_BOOKED_TRADE = new Set(['CANCELLED', 'REJECTED', 'REVERSED']);

const WEEKDAY_FROM_SATURDAY: Record<string, number> = {
  Sat: 0,
  Sun: 1,
  Mon: 2,
  Tue: 3,
  Wed: 4,
  Thu: 5,
  Fri: 6,
};

export function readOrderSide(metadata: unknown): OrderSide | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const side = (metadata as { side?: unknown }).side;
  return side === 'BUY' || side === 'SELL' ? side : null;
}

export function isBookedActivity(row: Pick<ActivityOrderInput, 'status' | 'trade'>): boolean {
  if (NON_BOOKED_ORDER.has(row.status)) return false;
  if (row.trade && NON_BOOKED_TRADE.has(row.trade.status)) return false;
  return true;
}

function money(value: Decimal): string {
  return value.toFixed(2);
}

function grams(value: Decimal): string {
  return value.toFixed(6);
}

function emptySide(): { amount: Decimal; weight: Decimal; count: number } {
  return { amount: new Decimal(0), weight: new Decimal(0), count: 0 };
}

function publishSide(side: { amount: Decimal; weight: Decimal; count: number }): SideTotal {
  return { amountRial: money(side.amount), grams: grams(side.weight), count: side.count };
}

function purityKey(value: string): string {
  try {
    return new Decimal(value).toFixed(6);
  } catch {
    return value;
  }
}

function samePurity(left: string, right: string): boolean {
  try {
    return new Decimal(left).eq(new Decimal(right));
  } catch {
    return false;
  }
}

function passesQuery(row: ActivityOrderInput, query: ActivityQuery): boolean {
  if (query.side && row.side !== query.side) return false;
  if (query.status && row.status !== query.status) return false;
  if (query.purityRatio && !samePurity(row.purityRatio, query.purityRatio)) return false;
  if (query.q) {
    const needle = query.q.trim().toLowerCase();
    if (needle) {
      const orderHit = row.orderNumber.toLowerCase().includes(needle);
      const tradeHit = row.trade?.tradeNumber.toLowerCase().includes(needle) ?? false;
      if (!orderHit && !tradeHit) return false;
    }
  }
  if (!query.status && row.status === 'DRAFT') return false;
  return true;
}

function countsTowardVolume(row: ActivityOrderInput, query: ActivityQuery): boolean {
  if (query.status) return true;
  return isBookedActivity(row);
}

/** Commercial weight and amount already stored on the trade, otherwise on the order. */
function commercial(row: ActivityOrderInput): {
  amount: string;
  weight: string;
  unit: string | null;
} {
  if (row.trade && !NON_BOOKED_TRADE.has(row.trade.status)) {
    return {
      amount: row.trade.totalAmountRial,
      weight: row.trade.weightGrams,
      unit: row.trade.unitPriceRial,
    };
  }
  return {
    amount: row.totalAmountRial,
    weight: row.weightGrams,
    unit: row.unitPriceRial,
  };
}

function displayStatus(row: ActivityOrderInput): string {
  if (row.trade && NON_BOOKED_TRADE.has(row.trade.status)) return row.trade.status;
  return row.status;
}

function persianParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => {
    const raw = parts.find((part) => part.type === type)?.value ?? '0';
    return Number(raw.replace(/[^\d]/g, '')) || 0;
  };
  return { year: read('year'), month: read('month'), day: read('day') };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function tehranWeekdayFromSaturday(date: Date): number {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    weekday: 'short',
  }).format(date);
  return WEEKDAY_FROM_SATURDAY[label] ?? 0;
}

export function activityBucketKey(date: Date, bucket: ActivityBucket): string {
  if (bucket === 'week') {
    const start = new Date(date.getTime() - tehranWeekdayFromSaturday(date) * 86_400_000);
    const parts = persianParts(start);
    return `W:${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  }
  const parts = persianParts(date);
  if (bucket === 'year') return `Y:${parts.year}`;
  if (bucket === 'quarter') return `Q:${parts.year}-${pad(Math.ceil(parts.month / 3))}`;
  return `M:${parts.year}-${pad(parts.month)}`;
}

function share(part: Decimal, total: Decimal): string {
  if (total.lte(0)) return '0.0';
  return part.div(total).times(100).toFixed(1);
}

function toTransaction(row: ActivityOrderInput, counted: boolean): ActivityTransaction {
  const figures = commercial(row);
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    side: row.side,
    status: displayStatus(row),
    weightGrams: figures.weight,
    purityRatio: row.purityRatio,
    unitPriceRial: figures.unit,
    totalAmountRial: figures.amount,
    createdAt: row.createdAt.toISOString(),
    submittedAt: row.submittedAt,
    confirmedAt: row.trade?.confirmedAt ?? null,
    reservedAmountRial: row.reservedAmountRial,
    countsTowardVolume: counted,
    tradeId: row.trade?.id ?? null,
    tradeNumber: row.trade?.tradeNumber ?? null,
    quotationId: row.quotationId ?? row.trade?.quotationId ?? null,
    quotationNumber: row.quotationNumber,
    wageAmount: row.trade?.wageAmount ?? null,
    taxAmount: row.trade?.taxAmount ?? null,
    paymentMethods: row.paymentMethods,
    settlementStatus: row.settlementStatus,
  };
}

export function computeCustomerActivity(
  rows: ActivityOrderInput[],
  query: ActivityQuery,
): ActivityComputation {
  const purities = Array.from(new Set(rows.map((row) => purityKey(row.purityRatio)))).sort();
  const visible = rows.filter((row) => passesQuery(row, query));
  const counted = visible.filter((row) => countsTowardVolume(row, query));

  const buy = emptySide();
  const sell = emptySide();
  const unclassified = emptySide();
  const buckets = new Map<string, { buy: Decimal; sell: Decimal; unclassified: Decimal }>();

  for (const row of counted) {
    const figures = commercial(row);
    const amount = new Decimal(figures.amount);
    const weight = new Decimal(figures.weight);
    const target = row.side === 'BUY' ? buy : row.side === 'SELL' ? sell : unclassified;
    target.amount = target.amount.plus(amount);
    target.weight = target.weight.plus(weight);
    target.count += 1;

    const key = activityBucketKey(row.createdAt, query.bucket);
    const bucket = buckets.get(key) ?? {
      buy: new Decimal(0),
      sell: new Decimal(0),
      unclassified: new Decimal(0),
    };
    if (row.side === 'BUY') bucket.buy = bucket.buy.plus(weight);
    else if (row.side === 'SELL') bucket.sell = bucket.sell.plus(weight);
    else bucket.unclassified = bucket.unclassified.plus(weight);
    buckets.set(key, bucket);
  }

  const volumeWeight = buy.weight.plus(sell.weight).plus(unclassified.weight);
  const segments: ActivitySegment[] = [];
  if (buy.weight.gt(0)) {
    segments.push({ id: 'BUY', grams: grams(buy.weight), share: share(buy.weight, volumeWeight) });
  }
  if (sell.weight.gt(0)) {
    segments.push({
      id: 'SELL',
      grams: grams(sell.weight),
      share: share(sell.weight, volumeWeight),
    });
  }
  if (unclassified.weight.gt(0)) {
    segments.push({
      id: 'UNCLASSIFIED',
      grams: grams(unclassified.weight),
      share: share(unclassified.weight, volumeWeight),
    });
  }

  const series = Array.from(buckets.entries())
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, bucket]) => ({
      key,
      buyGrams: grams(bucket.buy),
      sellGrams: grams(bucket.sell),
      unclassifiedGrams: grams(bucket.unclassified),
    }));

  const total = visible.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
  const start = (query.page - 1) * query.limit;
  const transactions = visible
    .slice(start, start + query.limit)
    .map((row) => toTransaction(row, countsTowardVolume(row, query)));

  return {
    pnl: {
      supported: false,
      realizedRial: null,
      unrealizedRial: null,
      totalRial: null,
      changePercent: null,
    },
    volume: { grams: grams(volumeWeight), count: counted.length, unit: 'GRAM' },
    buy: publishSide(buy),
    sell: publishSide(sell),
    unclassified: publishSide(unclassified),
    distribution: { unit: 'GRAM', segments },
    series,
    purities,
    excludedCount: visible.length - counted.length,
    totalsBasis: query.status ? 'status-filter' : 'booked',
    transactions,
    meta: { page: query.page, limit: query.limit, total, totalPages },
  };
}
