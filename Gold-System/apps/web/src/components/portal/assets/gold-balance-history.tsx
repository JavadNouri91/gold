import { formatWeight } from '@/lib/utils';
import type { PortfolioHistorySeries } from '@/lib/portfolio-history-preview';
import { PreviewNote, assetCardClass } from './assets-ui';

export function GoldBalanceHistory({ series }: { series: PortfolioHistorySeries }) {
  const max = Math.max(...series.points.map((point) => Number(point.weightGrams)), 0);

  return (
    <section aria-labelledby="weight-history-title" className={assetCardClass}>
      <h2 id="weight-history-title" className="text-base font-bold text-[#202124]">
        تغییرات وزن دارایی
      </h2>
      <p className="mt-1 text-xs leading-5 text-[#6B7280]">
        تغییرات موجودی طلای آبشده. این نمودار قیمت بازار طلا نیست.
      </p>
      <div className="mt-3">
        <PreviewNote />
      </div>
      <ul className="mt-4 space-y-3">
        {series.points.map((point) => {
          const width = max > 0 ? Math.max(8, (Number(point.weightGrams) / max) * 100) : 0;
          return (
            <li key={point.id} className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span className="text-[#6B7280]">{point.label}</span>
                <span className="font-semibold tabular-nums text-[#202124]">{formatWeight(point.weightGrams)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#F8F9FA]" aria-hidden>
                <div className="h-full rounded-full bg-[#C8922E]" style={{ width: `${width}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
