import { decimalUnits } from '@/lib/decimal-string';
import type { CreditFigures } from '@/lib/credit-view';
import { CreditSection, formatCreditAmount, formatShare } from './credit-ui';

const SEGMENTS = [
  { key: 'available', label: 'در دسترس', color: '#16A34A' },
  { key: 'reserved', label: 'رزرو شده', color: '#F59E0B' },
  { key: 'consumed', label: 'مصرف شده', color: '#DC2626' },
] as const;

export function CreditComposition({ figures }: { figures: CreditFigures }) {
  const slices = [
    { ...SEGMENTS[0], units: positiveUnits(figures.available), percent: figures.availablePercent },
    { ...SEGMENTS[1], units: positiveUnits(figures.reserved), percent: figures.reservedPercent },
    { ...SEGMENTS[2], units: positiveUnits(figures.consumed), percent: figures.consumedPercent },
  ];
  const summary = slices
    .map((slice) => `${slice.label} ${formatShare(slice.percent)}`)
    .join('، ');

  return (
    <CreditSection title="ترکیب اعتبار" id="credit-composition-title">
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
        <Donut slices={slices} center={formatCreditAmount(figures.limit)} summary={summary} />
        <ul className="min-w-0 w-full flex-1 space-y-2">
          {slices.map((slice) => (
            <li key={slice.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-[#202124]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} aria-hidden />
                <span className="truncate">{slice.label}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{formatShare(slice.percent)}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only">ترکیب اعتبار: {summary}. سقف اعتبار {formatCreditAmount(figures.limit)} ریال.</p>
    </CreditSection>
  );
}

function positiveUnits(value: string): bigint {
  const units = decimalUnits(value);
  if (units == null || units < BigInt(0)) return BigInt(0);
  return units;
}

function Donut({
  slices,
  center,
  summary,
}: {
  slices: Array<{ key: string; color: string; units: bigint }>;
  center: string;
  summary: string;
}) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, slice) => sum + slice.units, BigInt(0));
  let offset = 0;

  return (
    <div className="relative h-40 w-40 shrink-0">
      <svg viewBox="0 0 140 140" className="h-full w-full" role="img" aria-label={`نمودار حلقه‌ای ترکیب اعتبار. ${summary}`}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#E5E7EB" strokeWidth="14" />
        {total > BigInt(0)
          ? slices.map((slice) => {
              const length = Number((slice.units * BigInt(10000)) / total) / 10000 * circumference;
              const dash = `${length} ${circumference - length}`;
              const segment = (
                <circle
                  key={slice.key}
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth="14"
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 70 70)"
                />
              );
              offset += length;
              return segment;
            })
          : null}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
        <span className="max-w-[5.5rem] break-words text-[11px] font-bold leading-4 tabular-nums text-[#202124]">
          {center}
        </span>
        <span className="text-[10px] text-[#6B7280]">ریال</span>
        <span className="text-[10px] text-[#6B7280]">سقف اعتبار</span>
      </div>
    </div>
  );
}
