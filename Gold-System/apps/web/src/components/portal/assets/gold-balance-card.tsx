import Link from 'next/link';
import type { CurrentPrice } from '@/lib/api';
import { formatDateTime, formatRial, formatWeight } from '@/lib/utils';
import { isRegisteredHolding, type PortfolioPosition } from '@/lib/customer-portfolio';
import { AssetSkeleton, assetCardClass } from './assets-ui';

export function GoldBalanceCard({
  position,
  price,
  priceLoading,
  priceError,
  onRefreshPrice,
}: {
  position: PortfolioPosition | null;
  price?: CurrentPrice;
  priceLoading?: boolean;
  priceError?: boolean;
  onRefreshPrice?: () => void;
}) {
  const holding = isRegisteredHolding(position) ? position : null;

  return (
    <section aria-labelledby="gold-balance-title" id="gold-balance" className={assetCardClass}>
      <div className="flex items-start justify-between gap-3">
        <h2 id="gold-balance-title" className="text-base font-bold text-[#202124]">
          موجودی طلای آبشده
        </h2>
        <GoldMark />
      </div>

      {holding ? (
        <div className="mt-4">
          <p className="text-3xl font-bold tabular-nums tracking-tight text-[#202124]">
            {formatWeight(holding.weightGrams)}
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <div>
              <dt className="text-xs text-[#6B7280]">عیار</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-[#202124]">
                {holding.purityLabel ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#6B7280]">میانگین قیمت خرید</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-[#202124]">
                {formatRial(holding.averageBuyPriceRial)}
              </dd>
            </div>
          </dl>
          <div className="mt-4 rounded-xl bg-[#FFF4D6] px-3 py-3">
            <p className="text-xs text-[#6B7280]">ارزش روز دارایی</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-[#202124]">
              {formatRial(holding.marketValueRial)}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-[#F8F9FA] px-3 py-4">
          <p className="text-sm leading-7 text-[#202124]">
            هنوز طلای آبشده‌ای در دارایی شما ثبت نشده است.
          </p>
          <Link
            href="/portal/orders/new?side=buy"
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#C8922E] px-4 text-sm font-semibold text-white"
          >
            خرید طلا
          </Link>
        </div>
      )}

      <LivePrice
        price={price}
        loading={priceLoading}
        error={priceError}
        onRefresh={onRefreshPrice}
      />
    </section>
  );
}

function LivePrice({
  price,
  loading,
  error,
  onRefresh,
}: {
  price?: CurrentPrice;
  loading?: boolean;
  error?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <div className="mt-4 border-t border-[#E5E7EB] pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[#202124]">قیمت لحظه‌ای طلای آبشده</p>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-medium text-[#C8922E]"
        >
          بروزرسانی
        </button>
      </div>
      {loading ? (
        <AssetSkeleton className="mt-2 h-6 w-40" />
      ) : error || !price?.normalizedValue ? (
        <p className="mt-1 text-xs leading-5 text-[#6B7280]">
          قیمت لحظه‌ای در حال حاضر قابل دریافت نیست.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm font-bold tabular-nums text-[#202124]">
            {formatRial(price.normalizedValue)}
          </p>
          <p className="mt-1 text-[11px] text-[#6B7280]">
            آخرین بروزرسانی: {formatDateTime(price.capturedAt)}
            {price.validityStatus !== 'VALID' ? ' · قیمت نامعتبر' : ''}
          </p>
        </>
      )}
    </div>
  );
}

function GoldMark() {
  return (
    <svg width="56" height="40" viewBox="0 0 56 40" aria-hidden className="shrink-0">
      <rect x="16" y="2" width="28" height="11" rx="2" fill="#E7C56A" />
      <rect x="8" y="13" width="40" height="11" rx="2" fill="#C8922E" />
      <rect x="2" y="24" width="52" height="13" rx="2" fill="#A67420" />
    </svg>
  );
}
