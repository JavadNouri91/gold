'use client';

import { ChevronDown, Pencil, Power } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TradingMeter, TradingSessionView } from '@/lib/internal-api';
import { cn, formatMoney, formatWeight, toPersianDigits } from '@/lib/utils';

export const WEEKDAYS = [
  { id: 'SATURDAY', label: 'شنبه' },
  { id: 'SUNDAY', label: 'یکشنبه' },
  { id: 'MONDAY', label: 'دوشنبه' },
  { id: 'TUESDAY', label: 'سه‌شنبه' },
  { id: 'WEDNESDAY', label: 'چهارشنبه' },
  { id: 'THURSDAY', label: 'پنجشنبه' },
  { id: 'FRIDAY', label: 'جمعه' },
] as const;

const STATUS_TONE = {
  فعال: 'green',
  'شروع نشده': 'blue',
  'پایان یافته': 'gray',
  تعطیل: 'red',
  'محدودیت تکمیل شده': 'red',
} as const;

export function clock(value: string): string {
  return toPersianDigits(value);
}

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const tone = STATUS_TONE[status as keyof typeof STATUS_TONE] ?? 'gray';
  return <Badge variant={tone}>{status}</Badge>;
}

export function Meter({
  percent,
  tone,
}: {
  percent: number | null;
  tone: 'green' | 'gold' | 'blue';
}) {
  const color = { green: 'bg-green-500', gold: 'bg-gold-500', blue: 'bg-blue-500' }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className={cn('h-full rounded-full', color)}
        style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }}
      />
    </div>
  );
}

export function Ring({
  percent,
  color,
  label,
}: {
  percent: number | null;
  color: string;
  label: string;
}) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const shown = percent ?? 0;
  const offset = circumference - (Math.min(100, Math.max(0, shown)) / 100) * circumference;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" className="stroke-gray-100" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">
        {percent == null ? '—' : toPersianDigits(`${percent}٪`)}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function money(value: string | number | null | undefined): string {
  if (value == null || value === '') return 'بدون سقف';
  return formatMoney(value);
}

export function grams(value: string | number | null | undefined): string {
  if (value == null || value === '') return 'بدون سقف';
  return formatWeight(value);
}

export function countText(value: string | number | null | undefined, suffix = ''): string {
  if (value == null || value === '') return 'بدون سقف';
  return `${toPersianDigits(String(value))}${suffix ? ` ${suffix}` : ''}`;
}

export function meterLabel(meter: TradingMeter, kind: 'money' | 'weight' | 'count'): string {
  const format = kind === 'money' ? money : kind === 'weight' ? grams : (value: string | number | null) => countText(value);
  return `${format(meter.used)} از ${meter.max == null ? 'بدون سقف' : format(meter.max)}`;
}

export function SessionCard({
  session,
  expanded,
  onToggle,
  onEdit,
  onToggleEnabled,
  canEdit,
  busy,
}: {
  session: TradingSessionView;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onToggleEnabled: () => void;
  canEdit: boolean;
  busy: boolean;
}) {
  const active = session.status === 'فعال';
  return (
    <article
      className={cn(
        'rounded-xl border bg-white p-4 shadow-sm',
        active ? 'border-green-200' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{session.title}</h3>
            <StatusBadge status={session.enabled ? session.status : 'شروع نشده'} />
            {!session.enabled ? <Badge variant="gray">غیرفعال</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
            {clock(session.startTime)} – {clock(session.endTime)}
          </p>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          aria-expanded={expanded}
          aria-label={expanded ? 'بستن جزئیات' : 'نمایش جزئیات'}
          onClick={onToggle}
        >
          <ChevronDown className={cn('h-4 w-4 transition', expanded ? 'rotate-180' : '')} />
        </button>
      </div>
      <div className="mt-3 space-y-2">
        <Meter percent={session.amountPercent} tone="green" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>سقف ریالی {money(session.maxAmountRial)}</span>
          <span>مصرف‌شده {money(session.usedAmountRial)}</span>
        </div>
      </div>
      {expanded ? (
        <div className="mt-3 space-y-3 border-t pt-3 text-sm">
          <div>
            <Meter percent={session.weightPercent} tone="gold" />
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>سقف وزن {grams(session.maxWeightGrams)}</span>
              <span>مصرف‌شده {grams(session.usedWeightGrams)}</span>
            </div>
          </div>
          <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <p>باقی‌مانده مبلغ: {money(session.remainingAmountRial)}</p>
            <p>باقی‌مانده وزن: {grams(session.remainingWeightGrams)}</p>
            <p>سقف تعداد: {countText(session.maxCount, 'معامله')}</p>
            <p>مصرف‌شده: {countText(session.usedCount, 'معامله')}</p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={onEdit} disabled={busy}>
                <Pencil className="ms-1 h-3.5 w-3.5" />
                ویرایش
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onToggleEnabled} disabled={busy}>
                <Power className="ms-1 h-3.5 w-3.5" />
                {session.enabled ? 'غیرفعال کردن' : 'فعال کردن'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
