import Link from 'next/link';
import { Coins, Package, Percent, Tag, Wallet } from 'lucide-react';
import type { CurrentPrice } from '@/lib/api';
import { isZeroDecimal } from '@/lib/decimal-string';
import { isRegisteredHolding, type PortfolioPosition } from '@/lib/customer-portfolio';
import { formatDateTime, formatRial, formatWeight, toPersianDigits } from '@/lib/utils';
import {
  AssetSkeleton,
  CardHeading,
  SignedMoney,
  assetCaptionClass,
  assetCardClass,
  assetFigureClass,
} from './assets-ui';

export function PortfolioSummary({
  position,
  holdingLoading,
  holdingError,
  price,
  priceLoading,
  priceError,
  onRefreshPrice,
}: {
  position: PortfolioPosition | null;
  holdingLoading?: boolean;
  holdingError?: boolean;
  price?: CurrentPrice;
  priceLoading?: boolean;
  priceError?: boolean;
  onRefreshPrice?: () => void;
}) {
  const holding = isRegisteredHolding(position) ? position : null;
  const reservedPickup = holding?.reservedPickupGrams ?? '0';
  const hasPendingPickup = holding != null && !isZeroDecimal(reservedPickup);

  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <section aria-labelledby="portfolio-value-title" className={assetCardClass}>
        <CardHeading id="portfolio-value-title" title="ارزش روز دارایی" icon={Wallet} />
        {holdingLoading ? (
          <AssetSkeleton className="mt-3 h-10 w-40" />
        ) : (
          <>
            <p className={assetFigureClass}>{holding ? formatRial(holding.marketValueRial) : '—'}</p>
            <p className={assetCaptionClass}>مقایسه با ماه گذشته در دسترس نیست</p>
          </>
        )}
      </section>

      <section aria-labelledby="unrealized-title" className={assetCardClass}>
        <CardHeading id="unrealized-title" title="سود و زیان تحقق‌نیافته" icon={Percent} />
        {holdingLoading ? (
          <AssetSkeleton className="mt-3 h-10 w-36" />
        ) : (
          <>
            <SignedMoney
              value={holding?.unrealizedPnlRial}
              percent={holding?.unrealizedPnlRial ? holding.changePercent : null}
              whole
              className="mt-3 text-xl font-bold sm:text-2xl"
            />
            <p className={assetCaptionClass}>ارزش روز منهای بهای خرید مانده</p>
          </>
        )}
      </section>

      <section aria-labelledby="gold-balance-title" className={assetCardClass}>
        <CardHeading id="gold-balance-title" title="موجودی طلای آبشده" icon={Coins} />
        {holdingLoading ? (
          <AssetSkeleton className="mt-3 h-10 w-32" />
        ) : holdingError ? (
          <p className="mt-3 text-sm leading-7 text-[#6B7280]">موجودی طلا در حال حاضر قابل دریافت نیست.</p>
        ) : holding ? (
          <>
            <p className={assetFigureClass}>{formatWeight(holding.weightGrams)}</p>
            <p className={assetCaptionClass}>
              {holding.purityLabel ? `عیار ${toPersianDigits(holding.purityLabel)}` : 'خالص خرید منهای فروش'}
            </p>
            <Link
              href="/portal/pickups/new"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#C8922E]"
            >
              تحویل حضوری
            </Link>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-7 text-[#202124]">هنوز طلای آبشده‌ای در دارایی شما ثبت نشده است.</p>
            <Link
              href="/portal/orders/new?side=buy"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#C8922E]"
            >
              خرید طلا
            </Link>
          </>
        )}
      </section>

      <section aria-labelledby="pending-pickup-title" className={assetCardClass}>
        <CardHeading id="pending-pickup-title" title="طلای در انتظار تحویل" icon={Package} />
        {holdingLoading ? (
          <AssetSkeleton className="mt-3 h-10 w-32" />
        ) : holdingError ? (
          <p className="mt-3 text-sm leading-7 text-[#6B7280]">وضعیت تحویل در حال حاضر قابل دریافت نیست.</p>
        ) : holding ? (
          <>
            <p className={assetFigureClass}>{formatWeight(reservedPickup)}</p>
            <p className={assetCaptionClass}>
              {hasPendingPickup
                ? 'رزرو‌شده برای تحویل حضوری در فروشگاه (هنوز تحویل نشده)'
                : 'درخواست تحویل حضوریِ بازی ندارید'}
            </p>
            <Link
              href={hasPendingPickup ? '/portal/pickups' : '/portal/pickups/new'}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#C8922E]"
            >
              {hasPendingPickup ? 'مشاهده درخواست‌ها' : 'ثبت درخواست تحویل'}
            </Link>
          </>
        ) : (
          <p className="mt-3 text-sm leading-7 text-[#6B7280]">
            پس از ثبت دارایی، طلای رزرو‌شده برای تحویل اینجا دیده می‌شود.
          </p>
        )}
      </section>

      <section aria-labelledby="spot-price-title" className={assetCardClass}>
        <CardHeading id="spot-price-title" title="قیمت لحظه‌ای هر گرم" icon={Tag} />
        {priceLoading ? (
          <AssetSkeleton className="mt-3 h-10 w-36" />
        ) : priceError || !price?.normalizedValue ? (
          <>
            <p className="mt-3 text-sm leading-7 text-[#6B7280]">قیمت لحظه‌ای در حال حاضر قابل دریافت نیست.</p>
            <button
              type="button"
              onClick={onRefreshPrice}
              className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#C8922E]"
            >
              تلاش مجدد
            </button>
          </>
        ) : (
          <>
            <p className={assetFigureClass}>{formatRial(price.normalizedValue)}</p>
            <p className={assetCaptionClass}>آخرین بروزرسانی: {formatDateTime(price.capturedAt)}</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-[#202124]">
              <span
                className={`h-2 w-2 rounded-full ${price.validityStatus === 'VALID' ? 'bg-[#16A34A]' : 'bg-amber-500'}`}
                aria-hidden
              />
              {price.validityStatus === 'VALID' ? 'بازار فعال' : 'قیمت نامعتبر'}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
