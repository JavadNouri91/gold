import { PieChart } from 'lucide-react';
import { formatRial, formatWeight, toPersianDigits } from '@/lib/utils';
import { isRegisteredHolding, type PortfolioPosition } from '@/lib/customer-portfolio';
import { CardHeading, EmptyNote, assetCardClass } from './assets-ui';

export function AssetComposition({ position }: { position: PortfolioPosition | null }) {
  const holding = isRegisteredHolding(position) ? position : null;
  const slices = holding?.assets.length
    ? holding.assets
    : holding
      ? [{ id: 'melted', label: 'طلای آبشده', weightGrams: holding.weightGrams, share: 100 }]
      : [];

  return (
    <section aria-labelledby="composition-title" className={assetCardClass}>
      <CardHeading id="composition-title" title="ترکیب دارایی" icon={PieChart} />
      {slices.length === 0 ? (
        <div className="mt-6">
          <EmptyNote>ترکیب دارایی پس از ثبت موجودی طلا نمایش داده می‌شود.</EmptyNote>
        </div>
      ) : (
        <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row">
          <Donut label={formatWeight(slices[0]?.weightGrams)} />
          <ul className="min-w-0 flex-1 space-y-3">
            {slices.map((slice) => (
              <li key={slice.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-[#202124]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#C8922E]" aria-hidden />
                  <span className="truncate font-semibold">{slice.label}</span>
                </span>
                <span className="shrink-0 text-left">
                  <span className="block font-semibold tabular-nums">{formatWeight(slice.weightGrams)}</span>
                  <span className="block text-xs text-[#6B7280]">{toPersianDigits(String(slice.share))}٪</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {holding?.marketValueRial ? (
        <p className="mt-4 text-xs text-[#6B7280]">
          ارزش روز: <span className="font-semibold text-[#202124]">{formatRial(holding.marketValueRial)}</span>
        </p>
      ) : null}
    </section>
  );
}

function Donut({ label }: { label: string }) {
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label="ترکیب دارایی، یک نوع" className="shrink-0">
      <circle cx="66" cy="66" r="46" fill="none" stroke="#FFF4D6" strokeWidth="14" />
      <circle
        cx="66"
        cy="66"
        r="46"
        fill="none"
        stroke="#C8922E"
        strokeWidth="14"
        strokeDasharray="289 289"
        strokeLinecap="butt"
        transform="rotate(-90 66 66)"
      />
      <text x="66" y="64" textAnchor="middle" fontSize="13" fontWeight="700" fill="#202124">
        {label.replace(' گرم', '')}
      </text>
      <text x="66" y="82" textAnchor="middle" fontSize="11" fill="#6B7280">
        گرم
      </text>
    </svg>
  );
}
