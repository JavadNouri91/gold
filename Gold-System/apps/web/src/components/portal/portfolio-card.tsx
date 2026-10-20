'use client';

import { formatWholeMoney, formatWeight } from '@/lib/utils';
import { isRegisteredHolding, type PortfolioPosition } from '@/lib/customer-portfolio';

export function PortfolioCard({ position }: { position?: PortfolioPosition | null }) {
  const holding = isRegisteredHolding(position ?? null) ? position : null;

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-800">دارایی طلای من</h2>

      {holding ? (
        <>
          <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">
            {formatWeight(holding.weightGrams)}
          </p>
          <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
            <div>
              <dt className="text-[11px] text-slate-500">ارزش روز</dt>
              <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-slate-800">
                {formatWholeMoney(holding.marketValueRial)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">میانگین خرید</dt>
              <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-slate-800">
                {formatWholeMoney(holding.averageBuyPriceRial)}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <div className="mt-3 flex flex-1 items-center rounded-xl bg-slate-50 px-3 py-3">
          <p className="text-sm leading-6 text-slate-600">هنوز طلای آبشده‌ای در دارایی شما ثبت نشده است.</p>
        </div>
      )}
    </section>
  );
}
