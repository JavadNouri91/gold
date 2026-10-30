'use client';

import {
  ArrowLeftRight,
  RotateCcw,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { DatePickerJalali } from '@/components/ui/date-picker-jalali';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatFaNumber } from '@/lib/utils';

export type TradeSide = '' | 'BUY' | 'SELL';

export interface TradeFilterValues {
  side: TradeSide;
  status: string;
  q: string;
  from: string;
  to: string;
}

export const EMPTY_TRADE_FILTERS: TradeFilterValues = {
  side: '',
  status: '',
  q: '',
  from: '',
  to: '',
};

export const TRADE_STATUS_FILTER_OPTIONS = [
  { value: 'CONFIRMED', label: 'تأیید شده' },
  { value: 'PENDING_CONFIRMATION', label: 'در انتظار' },
  { value: 'REJECTED', label: 'رد شده' },
];

const SIDE_OPTIONS: Array<{
  value: TradeSide;
  label: string;
  icon: typeof ArrowLeftRight;
  active: string;
}> = [
  { value: '', label: 'همه', icon: ArrowLeftRight, active: 'border-gold-200 bg-white text-gold-800 shadow-sm' },
  { value: 'BUY', label: 'خرید', icon: TrendingUp, active: 'border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm' },
  { value: 'SELL', label: 'فروش', icon: TrendingDown, active: 'border-gold-300 bg-gold-50 text-gold-800 shadow-sm' },
];

/** Number of non-empty filter fields currently applied. */
function activeCount(values: TradeFilterValues): number {
  return [values.side, values.status, values.q.trim(), values.from, values.to].filter(Boolean).length;
}

/**
 * Live filter bar for the trades table. Every control commits its value
 * immediately through `onChange` (no apply button), mirroring the generic
 * `FilterBar` live convention.
 */
export function TradeFilterBar({
  value,
  onChange,
  onReset,
  busy = false,
}: {
  value: TradeFilterValues;
  onChange: (values: TradeFilterValues) => void;
  onReset: () => void;
  busy?: boolean;
}) {
  const set = <K extends keyof TradeFilterValues>(key: K, next: TradeFilterValues[K]) =>
    onChange({ ...value, [key]: next });

  const dateError =
    value.from && value.to && /^\d{4}-\d{2}-\d{2}$/.test(value.from) && /^\d{4}-\d{2}-\d{2}$/.test(value.to)
      ? value.from > value.to
        ? 'تاریخ شروع باید پیش از تاریخ پایان باشد.'
        : null
      : null;

  return (
    <form
      className="rounded-xl border bg-card p-4 shadow-sm"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
        {/* Customer search */}
        <div className="relative md:col-span-2 xl:col-span-3">
          <Input
            label="جستجوی مشتری"
            type="search"
            dir="rtl"
            placeholder="نام مشتری، کد مشتری یا موبایل"
            value={value.q}
            onChange={(event) => set('q', event.target.value)}
            className="ps-9"
          />
          <Search className="pointer-events-none absolute start-3 top-9 h-4 w-4 text-muted-foreground" aria-hidden />
        </div>

        {/* Transaction type */}
        <fieldset className="xl:col-span-3">
          <legend className="mb-1 block text-sm font-medium text-foreground">نوع معامله</legend>
          <div className="flex rounded-lg border border-input bg-muted p-1">
            {SIDE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = value.side === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set('side', option.value)}
                  className={cn(
                    'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500',
                    active && option.active,
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Status */}
        <label className="space-y-1 text-sm xl:col-span-2">
          <span className="font-medium">وضعیت</span>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 font-sans text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            value={value.status}
            onChange={(event) => set('status', event.target.value)}
          >
            <option value="">همه وضعیت‌ها</option>
            {TRADE_STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {/* Date range */}
        <div className="xl:col-span-2">
          <DatePickerJalali label="از تاریخ" value={value.from} allowFuture={false} onChange={(next) => set('from', next)} />
        </div>
        <div className="xl:col-span-2">
          <DatePickerJalali label="تا تاریخ" value={value.to} allowFuture={false} onChange={(next) => set('to', next)} />
        </div>

        {/* Actions */}
        <div className="md:col-span-2 xl:col-span-12">
          {dateError ? (
            <p role="alert" className="mb-2 text-start text-xs text-red-600">
              {dateError}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onReset} disabled={busy}>
              <RotateCcw className="ms-1 h-4 w-4" aria-hidden />
              پاک کردن
              {activeCount(value) > 0 ? (
                <span className="ms-1 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                  {formatFaNumber(activeCount(value))}
                </span>
              ) : null}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
