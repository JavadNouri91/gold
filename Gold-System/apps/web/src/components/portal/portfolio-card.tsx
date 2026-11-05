'use client';

import { formatWholeMoney, formatWeight } from '@/lib/utils';
import { type PortfolioPosition } from '@/lib/customer-portfolio';
import { decimalUnits } from '@/lib/decimal-string';

export function PortfolioCard({ position }: { position?: PortfolioPosition | null }) {
  const hasPaidPendingPurchase =
    (decimalUnits(position?.pendingPurchaseGrams ?? '0') ?? BigInt(0)) > BigInt(0) &&
    (decimalUnits(position?.pendingPurchaseAmountRial ?? '0') ?? BigInt(0)) > BigInt(0);
  const hasPendingDelivery = (decimalUnits(position?.reservedPickupGrams ?? '0') ?? BigInt(0)) > BigInt(0);
  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-800">دارایی طلای من</h2>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-500">
        <div>
          <dt>موجودی طلای تأییدشده</dt>
          <dd className="mt-1 font-semibold text-slate-800">
            {formatWeight(position?.confirmedWeightGrams ?? position?.weightGrams ?? '0')}
          </dd>
        </div>
        {hasPaidPendingPurchase && (
          <div>
            <dt>طلای در انتظار تأیید</dt>
            <dd className="mt-1 font-semibold text-slate-800">
              {formatWeight(position?.pendingPurchaseGrams ?? '0')}
            </dd>
          </div>
        )}
        {hasPendingDelivery && (
          <div>
            <dt>طلای در انتظار تحویل</dt>
            <dd className="mt-1 font-semibold text-slate-800">
              {formatWeight(position?.reservedPickupGrams ?? '0')}
            </dd>
          </div>
        )}
      </dl>
      {position ? (
        <>
          <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
            <div>
              <dt className="text-[11px] text-slate-500">ارزش روز طلای تأییدشده</dt>
              <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-slate-800">
                {formatWholeMoney(position.confirmedMarketValueRial ?? position.marketValueRial)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">میانگین خرید</dt>
              <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-slate-800">
                {formatWholeMoney(position.averageBuyPriceRial)}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <div className="mt-3 flex flex-1 items-center rounded-xl bg-slate-50 px-3 py-3">
          <p className="text-sm leading-6 text-slate-600">
            هنوز طلای آبشده‌ای در دارایی شما ثبت نشده است.
          </p>
        </div>
      )}
    </section>
  );
}
