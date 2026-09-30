'use client';

import Link from 'next/link';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { formatRial, formatWeight, toPersianDigits } from '@/lib/utils';
import { DEMO_PORTFOLIO } from '@/lib/portal-demo';

export function PortfolioCard({ demo = true }: { demo?: boolean }) {
  const data = DEMO_PORTFOLIO;
  const positive = !data.unrealizedPnlRial.startsWith('-');

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">دارایی من</h2>
          {demo ? (
            <p className="mt-1 text-[11px] text-amber-700">نمونه نمایشی — موجودی طلا هنوز از سرور خوانده نمی‌شود</p>
          ) : null}
        </div>
        <GoldBars />
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">موجودی طلای آبشده</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{formatWeight(data.weightGrams)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 px-3 py-3">
        <p className="text-xs text-muted-foreground">ارزش روز دارایی</p>
        <p className="mt-1 text-lg font-bold tabular-nums text-slate-800">{formatRial(data.marketValueRial)}</p>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">میانگین قیمت خرید</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums">{formatRial(data.avgBuyPriceRial)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">سود/زیان تحقق‌نیافته</dt>
          <dd className={`mt-1 text-sm font-semibold tabular-nums ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
            {positive ? '+' : ''}
            {formatRial(data.unrealizedPnlRial)}
            <span className="mr-1 text-xs">
              ({positive ? '+' : ''}
              {toPersianDigits(data.unrealizedPnlPercent)}٪)
            </span>
          </dd>
        </div>
      </dl>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Link
          href="/portal/orders/new?side=buy"
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          خرید طلا
          <ArrowUp className="h-4 w-4" />
        </Link>
        <Link
          href="/portal/orders/new?side=sell"
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700"
        >
          فروش طلا
          <ArrowDown className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function GoldBars() {
  return (
    <svg width="72" height="48" viewBox="0 0 72 48" aria-hidden className="shrink-0">
      <rect x="18" y="4" width="36" height="14" rx="3" fill="#eab308" />
      <rect x="10" y="16" width="52" height="14" rx="3" fill="#ca8a04" />
      <rect x="4" y="28" width="64" height="16" rx="3" fill="#a16207" />
    </svg>
  );
}
