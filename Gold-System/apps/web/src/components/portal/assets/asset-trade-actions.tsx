import Link from 'next/link';
import { ArrowDown, ArrowLeftRight, ArrowUp } from 'lucide-react';
import type { CurrentPrice } from '@/lib/api';
import { isRegisteredHolding, type PortfolioPosition } from '@/lib/customer-portfolio';
import { formatRial, formatWeight } from '@/lib/utils';
import { CardHeading, assetCardClass } from './assets-ui';

export function AssetTradeActions({
  position,
  price,
}: {
  position: PortfolioPosition | null;
  price?: CurrentPrice;
}) {
  const holding = isRegisteredHolding(position) ? position : null;

  return (
    <section aria-labelledby="asset-trade-title" className={assetCardClass}>
      <CardHeading id="asset-trade-title" title="خرید و فروش" icon={ArrowLeftRight} />
      <dl className="mt-3 space-y-3">
        <div>
          <dt className="text-xs text-[#6B7280]">قیمت هر گرم</dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-[#202124]">
            {price?.normalizedValue ? formatRial(price.normalizedValue) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[#6B7280]">موجودی قابل فروش</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-[#202124]">
            {holding ? formatWeight(holding.weightGrams) : 'هنوز موجودی طلای آبشده‌ای برای فروش ندارید.'}
          </dd>
        </div>
      </dl>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          href="/portal/orders/new?side=buy"
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <ArrowUp className="h-4 w-4" aria-hidden />
          خرید طلا
        </Link>
        <Link
          href="/portal/orders/new?side=sell"
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700"
        >
          <ArrowDown className="h-4 w-4" aria-hidden />
          فروش طلا
        </Link>
      </div>
    </section>
  );
}
