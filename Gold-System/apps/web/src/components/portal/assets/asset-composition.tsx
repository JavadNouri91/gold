import { formatRial, formatWeight } from '@/lib/utils';
import { isRegisteredHolding, type PortfolioPosition } from '@/lib/customer-portfolio';
import { SignedMoney, assetCardClass } from './assets-ui';

const SLICE_COLORS = ['#C8922E', '#E7C56A', '#8C6A2F', '#F3E2B3'];

export function AssetComposition({ position }: { position: PortfolioPosition | null }) {
  const holding = isRegisteredHolding(position) ? position : null;
  const slices = holding?.assets?.length
    ? holding.assets
    : holding
      ? [{ id: 'melted', label: 'طلای آبشده', weightGrams: holding.weightGrams, share: 100 }]
      : [];

  return (
    <section aria-labelledby="composition-title" className={assetCardClass}>
      <h2 id="composition-title" className="text-base font-bold text-[#202124]">
        ترکیب دارایی
      </h2>
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <Donut slices={slices.map((slice) => slice.share)} />
        <div className="min-w-0 flex-1 space-y-2">
          {slices.length ? (
            slices.map((slice, index) => (
              <div key={slice.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-[#202124]">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: SLICE_COLORS[index % SLICE_COLORS.length] }}
                    aria-hidden
                  />
                  <span className="truncate">{slice.label}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatWeight(slice.weightGrams)}</span>
              </div>
            ))
          ) : (
            <p className="text-sm leading-7 text-[#6B7280]">ترکیب دارایی پس از ثبت موجودی طلا نمایش داده می‌شود.</p>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
        <div className="rounded-xl bg-[#F8F9FA] px-3 py-3">
          <dt className="text-xs text-[#6B7280]">سود تحقق‌یافته</dt>
          <dd className="mt-1">
            <SignedMoney value={holding?.realizedPnlRial} />
          </dd>
        </div>
        <div className="rounded-xl bg-[#F8F9FA] px-3 py-3">
          <dt className="text-xs text-[#6B7280]">سود تحقق‌نیافته</dt>
          <dd className="mt-1">
            <SignedMoney value={holding?.unrealizedPnlRial} />
          </dd>
        </div>
      </dl>
      {holding ? null : (
        <p className="sr-only">ارزش خرید و فروش تا زمان ثبت موجودی محاسبه نشده است.</p>
      )}
      {holding?.marketValueRial ? (
        <p className="mt-3 text-xs text-[#6B7280]">
          ارزش روز ثبت‌شده: <span className="font-semibold text-[#202124]">{formatRial(holding.marketValueRial)}</span>
        </p>
      ) : null}
    </section>
  );
}

function Donut({ slices }: { slices: number[] }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, value) => sum + Math.max(value, 0), 0);
  let offset = 0;

  return (
    <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label="نمودار حلقه‌ای ترکیب دارایی" className="shrink-0">
      <circle cx="56" cy="56" r={radius} fill="none" stroke="#E5E7EB" strokeWidth="12" />
      {total > 0
        ? slices.map((value, index) => {
            const length = (Math.max(value, 0) / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const segment = (
              <circle
                key={index}
                cx="56"
                cy="56"
                r={radius}
                fill="none"
                stroke={SLICE_COLORS[index % SLICE_COLORS.length]}
                strokeWidth="12"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                transform="rotate(-90 56 56)"
              />
            );
            offset += length;
            return segment;
          })
        : null}
      <text x="56" y="60" textAnchor="middle" fontSize="11" fill="#6B7280">
        {total > 0 ? 'طلا' : 'خالی'}
      </text>
    </svg>
  );
}
