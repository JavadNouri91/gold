'use client';

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { CurrentPrice } from '@/lib/api';
import { cn, formatRial, formatTime } from '@/lib/utils';
import {
  CHART_PERIOD_LABELS,
  DEMO_REFERENCE_PRICE_RIAL,
  demoPriceSeries,
  type ChartPeriod,
} from '@/lib/portal-demo';
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
  const [period, setPeriod] = useState<ChartPeriod>('1d');
  const live = price?.normalizedValue ? Number(price.normalizedValue) : NaN;
  const hasLive = Number.isFinite(live) && live > 0;
  const displayPrice = hasLive ? live : DEMO_REFERENCE_PRICE_RIAL;
  const series = useMemo(() => demoPriceSeries(displayPrice, period), [displayPrice, period]);
  const marketOpen = !price || price.validityStatus === 'VALID';

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">قیمت طلای آبشده</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">قیمت به ازای هر گرم</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span
              className={cn('h-2 w-2 rounded-full', marketOpen ? 'bg-emerald-500' : 'bg-amber-500')}
              aria-hidden
            />
            {marketOpen ? 'بازار فعال' : 'قیمت نامعتبر'}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50"
            aria-label="بروزرسانی قیمت"
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          </button>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        آخرین بروزرسانی: {price?.capturedAt ? formatTime(price.capturedAt) : '—'}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PriceQuote
          label="قیمت خرید"
          value={formatRial(hasLive ? price!.normalizedValue : DEMO_REFERENCE_PRICE_RIAL)}
          tone="buy"
        />
        <PriceQuote
          label="قیمت فروش"
          value={formatRial(hasLive ? price!.normalizedValue : DEMO_REFERENCE_PRICE_RIAL)}
          tone="sell"
        />
      </div>
      {!hasLive ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          قیمت زنده در دسترس نیست؛ ارقام نمایشی هستند.
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">
          اسپرد جداگانه خرید/فروش در API فعلی وجود ندارد؛ هر دو ستون قیمت مرجع لحظه‌ای را نشان می‌دهند.
        </p>
      )}

      <GoldPriceChart series={series} period={period} />

      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(CHART_PERIOD_LABELS) as ChartPeriod[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setPeriod(key)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium',
              period === key
                ? 'bg-gold-500 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100',
            )}
          >
            {CHART_PERIOD_LABELS[key]}
          </button>
        ))}
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
        'rounded-xl border p-3',
        buy ? 'border-emerald-100 bg-emerald-50/70' : 'border-red-100 bg-red-50/70',
      )}
    >
      <p className={cn('text-xs font-medium', buy ? 'text-emerald-700' : 'text-red-700')}>{label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-bold tabular-nums md:text-xl',
          buy ? 'text-emerald-800' : 'text-red-800',
        )}
      >
        {value}
      </p>
    </div>
  );
}
