import Link from 'next/link';
import { FileText } from 'lucide-react';
import type { CurrentPrice } from '@/lib/api';
import { addDecimal, isZeroDecimal } from '@/lib/decimal-string';
import { ownedGoldGrams } from '@/lib/asset-chart-range';
import { isRegisteredHolding, type PortfolioPosition } from '@/lib/customer-portfolio';
import { moneyTone, toneClass } from '@/lib/portfolio-display';
import { cn, formatDateTime, formatWholeMoney, formatWeight, toPersianDigits } from '@/lib/utils';
import { pendingPickupValueRial } from './asset-composition';
import { AssetSkeleton } from './assets-ui';

const kpiCardClass =
  'flex h-full min-w-0 flex-col rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm';

export function PortfolioSummary({
  position,
  holdingLoading,
  holdingError,
  price,
  priceLoading,
  priceError,
  onRefreshPrice,
  availableRial,
}: {
  position: PortfolioPosition | null;
  holdingLoading?: boolean;
  holdingError?: boolean;
  price?: CurrentPrice;
  priceLoading?: boolean;
  priceError?: boolean;
  onRefreshPrice?: () => void;
  availableRial?: string | null;
}) {
  const holding = isRegisteredHolding(position) ? position : null;
  const pendingRial = pendingPickupValueRial(holding?.reservedPickupGrams, price?.normalizedValue) ?? '0';
  const goldRial = holding?.marketValueRial && !isZeroDecimal(holding.marketValueRial) ? holding.marketValueRial : '0';
  const cashRial = availableRial && !isZeroDecimal(availableRial) ? availableRial : '0';
  const totalRial = addDecimal(addDecimal(cashRial, goldRial), pendingRial);
  const goldGrams = ownedGoldGrams(holding?.weightGrams, holding?.reservedPickupGrams);
  const goldValueRial = addDecimal(goldRial, pendingRial);
  const pnlTone = moneyTone(holding?.unrealizedPnlRial);
  const hasPnl = holding?.unrealizedPnlRial != null && !isZeroDecimal(holding.unrealizedPnlRial);

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
      <section aria-labelledby="portfolio-value-title" className={kpiCardClass}>
        <h2 id="portfolio-value-title" className="text-sm font-medium text-[#6B7280]">
          مجموع ارزش کل دارایی
        </h2>
        {holdingLoading ? (
          <AssetSkeleton className="mt-3 h-10 w-40" />
        ) : (
          <>
            <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-[#202124]">
              {isZeroDecimal(totalRial) ? '—' : formatWholeMoney(totalRial)}
            </p>
            {hasPnl ? (
              <p className={cn('mt-2 text-sm font-semibold tabular-nums', toneClass(pnlTone))}>
                <span dir="ltr">
                  {pnlTone === 'negative' ? '−' : '+'}
                  {holding?.changePercent
                    ? `${toPersianDigits(holding.changePercent.replace(/^-/, ''))}٪`
                    : ''}
                </span>
                {holding?.unrealizedPnlRial ? (
                  <span>
                    {' '}
                    ({formatWholeMoney(holding.unrealizedPnlRial.replace(/^-/, ''))}){' '}
                    {pnlTone === 'negative' ? 'زیان کل' : 'سود کل'}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="mt-2 text-xs leading-5 text-[#6B7280]">سود و زیان تحقق‌نیافته در دسترس نیست</p>
            )}
            <div className="mt-auto space-y-1 pt-4 text-xs leading-5 text-[#6B7280]">
              <p>توان خرید (نقدی): {formatWholeMoney(cashRial)}</p>
              <p>ارزش طلا: {formatWholeMoney(goldValueRial)}</p>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="gold-balance-title" className={kpiCardClass}>
        <h2 id="gold-balance-title" className="text-sm font-medium text-[#6B7280]">
          مجموع موجودی طلا
        </h2>
        {holdingLoading ? (
          <AssetSkeleton className="mt-3 h-10 w-32" />
        ) : holdingError ? (
          <p className="mt-3 text-sm leading-7 text-[#6B7280]">موجودی طلا در حال حاضر قابل دریافت نیست.</p>
        ) : holding && !isZeroDecimal(goldGrams) ? (
          <>
            <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-[#202124]">
              {formatWeight(goldGrams)}
            </p>
            <p className="mt-2 text-sm text-[#6B7280]">معادل {formatWholeMoney(goldValueRial)}</p>
            <Link
              href="/portal/pickups/new"
              className="mt-auto inline-flex min-h-11 items-center gap-2 pt-4 text-sm font-semibold text-[#C8922E]"
            >
              <FileText className="h-4 w-4" aria-hidden />
              درخواست تحویل فیزیکی
            </Link>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-7 text-[#202124]">هنوز طلای آبشده‌ای در دارایی شما ثبت نشده است.</p>
            <Link
              href="/portal/orders/new?side=buy"
              className="mt-auto inline-flex min-h-11 items-center pt-4 text-sm font-semibold text-[#C8922E]"
            >
              خرید طلا
            </Link>
          </>
        )}
      </section>

      <section aria-labelledby="spot-price-title" className={kpiCardClass}>
        <h2 id="spot-price-title" className="text-sm font-medium text-[#6B7280]">
          نرخ لحظه‌ای هر گرم طلا
        </h2>
        {priceLoading ? (
          <AssetSkeleton className="mt-3 h-10 w-36" />
        ) : priceError || !price?.normalizedValue ? (
          <>
            <p className="mt-3 text-sm leading-7 text-[#6B7280]">قیمت لحظه‌ای در حال حاضر قابل دریافت نیست.</p>
            <button
              type="button"
              onClick={onRefreshPrice}
              className="mt-auto inline-flex min-h-11 items-center pt-4 text-sm font-semibold text-[#C8922E]"
            >
              تلاش مجدد
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-[#202124]">
              {formatWholeMoney(price.normalizedValue)}
            </p>
            <p className="mt-2 text-xs leading-5 text-[#6B7280]">آخرین بروزرسانی: {formatDateTime(price.capturedAt)}</p>
            <p className="mt-auto inline-flex items-center gap-1.5 pt-4 text-xs font-medium text-[#202124]">
              <span
                className={`h-2 w-2 rounded-full ${price.validityStatus === 'VALID' ? 'bg-[#16A34A]' : 'bg-amber-500'}`}
                aria-hidden
              />
              {price.validityStatus === 'VALID' ? 'بازار فعال است' : 'قیمت نامعتبر'}
            </p>
            <GoldPriceSpark />
          </>
        )}
      </section>
    </div>
  );
}

function GoldPriceSpark() {
  return (
    <svg viewBox="0 0 240 56" className="mt-3 h-14 w-full text-[#EAB308]" aria-hidden>
      <path
        d="M0 40 C24 38 36 28 52 30 C76 33 88 18 112 20 C136 22 148 36 172 28 C196 20 212 24 240 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M0 56 L0 40 C24 38 36 28 52 30 C76 33 88 18 112 20 C136 22 148 36 172 28 C196 20 212 24 240 12 L240 56 Z"
        fill="currentColor"
        opacity="0.16"
      />
    </svg>
  );
}
