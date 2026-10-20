'use client';

import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import type { CurrentPrice } from '@/lib/api';
import { cn, formatRial, formatTime } from '@/lib/utils';
import { DEMO_REFERENCE_PRICE_RIAL, demoPriceSeries } from '@/lib/portal-demo';
import { GoldPriceChart } from '@/components/portal/gold-price-chart';

export function GoldPriceCard({
  price,
  onRefresh,
  isRefreshing,
}: {
  price?: CurrentPrice;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const live = price?.normalizedValue ? Number(price.normalizedValue) : NaN;
  const hasLive = Number.isFinite(live) && live > 0;
  const displayPrice = hasLive ? live : DEMO_REFERENCE_PRICE_RIAL;
  const series = useMemo(() => demoPriceSeries(displayPrice, '1d'), [displayPrice]);
  const marketOpen = !price || price.validityStatus === 'VALID';
  const quote = formatRial(hasLive ? price!.normalizedValue : DEMO_REFERENCE_PRICE_RIAL);

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-800">قیمت لحظه‌ای طلای آبشده</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {price?.capturedAt ? `بروزرسانی ${formatTime(price.capturedAt)}` : 'قیمت هر گرم'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn('h-2 w-2 rounded-full', marketOpen ? 'bg-emerald-500' : 'bg-amber-500')}
            aria-hidden
          />
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50"
            aria-label="بروزرسانی قیمت"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <PriceQuote label="خرید" value={quote} tone="buy" />
        <PriceQuote label="فروش" value={quote} tone="sell" />
      </div>

      <div className="mt-auto">
        <GoldPriceChart series={series} period="1d" compact />
      </div>
    </section>
  );
}

function PriceQuote({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'buy' | 'sell';
}) {
  const buy = tone === 'buy';
  return (
    <div
      className={cn(
        'rounded-xl border px-2.5 py-2',
        buy ? 'border-emerald-100 bg-emerald-50/80' : 'border-rose-100 bg-rose-50/80',
      )}
    >
      <p className={cn('text-[11px] font-medium', buy ? 'text-emerald-700' : 'text-rose-700')}>
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 truncate text-sm font-bold tabular-nums',
          buy ? 'text-emerald-800' : 'text-rose-800',
        )}
      >
        {value}
      </p>
    </div>
  );
}
