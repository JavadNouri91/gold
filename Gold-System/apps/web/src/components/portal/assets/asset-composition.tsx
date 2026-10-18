import { PieChart } from 'lucide-react';
import {
  addDecimal,
  decimalUnits,
  isZeroDecimal,
  multiplyDecimal,
  percentOfDecimal,
} from '@/lib/decimal-string';
import { formatRial, formatWholeMoney, toPersianDigits } from '@/lib/utils';
import type { PortfolioPosition } from '@/lib/customer-portfolio';
import { CardHeading, EmptyNote, assetCardClass } from './assets-ui';

const SLICE_META = [
  { id: 'buying-power', label: 'توان خرید', color: '#2563EB', labelColor: '#FFFFFF' },
  { id: 'melted-gold', label: 'ارزش ریالی طلای آب‌شده', color: '#EAB308', labelColor: '#202124' },
  { id: 'pending-pickup', label: 'ارزش ریالی طلای در انتظار تحویل', color: '#C026D3', labelColor: '#FFFFFF' },
] as const;

export interface AssetCompositionSlice {
  id: (typeof SLICE_META)[number]['id'];
  label: string;
  color: string;
  labelColor: string;
  amountRial: string;
  share: number | null;
}

export function pendingPickupValueRial(
  reservedGrams: string | null | undefined,
  livePricePerGram: string | null | undefined,
): string | null {
  if (!reservedGrams || !livePricePerGram || isZeroDecimal(reservedGrams)) return null;
  try {
    return multiplyDecimal(reservedGrams, livePricePerGram);
  } catch {
    return null;
  }
}

export function assetCompositionSlices(
  availableRial: string | null | undefined,
  meltedGoldRial: string | null | undefined,
  pendingPickupRial: string | null | undefined,
): AssetCompositionSlice[] {
  const amounts = [positiveAmount(availableRial), positiveAmount(meltedGoldRial), positiveAmount(pendingPickupRial)];
  let total = '0';
  for (const amount of amounts) {
    if (amount != null) total = addDecimal(total, amount);
  }
  const hasTotal = !isZeroDecimal(total);

  return SLICE_META.map((meta, index) => {
    const amountRial = amounts[index] ?? '0';
    return {
      ...meta,
      amountRial,
      share: hasTotal ? percentOfDecimal(amountRial, total) : 0,
    };
  });
}

export function AssetComposition({
  position,
  availableRial,
  livePriceRial,
}: {
  position: PortfolioPosition | null;
  availableRial?: string | null;
  livePriceRial?: string | null;
}) {
  const pendingRial = pendingPickupValueRial(position?.reservedPickupGrams, livePriceRial);
  const slices = assetCompositionSlices(availableRial, position?.marketValueRial, pendingRial);
  const total = slices.reduce((sum, slice) => addDecimal(sum, slice.amountRial), '0');
  const hasValue = !isZeroDecimal(total);
  const summary = slices.map((slice) => `${slice.label} ${formatShare(slice.share)}`).join('، ');

  return (
    <section aria-labelledby="composition-title" className={assetCardClass}>
      <CardHeading id="composition-title" title="ترکیب دارایی" icon={PieChart} />
      {!hasValue ? (
        <div className="mt-4">
          <EmptyNote>ترکیب دارایی پس از ثبت توان خرید یا موجودی طلا نمایش داده می‌شود.</EmptyNote>
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <Donut slices={slices} total={total} summary={summary} />
          <ul className="min-w-0 w-full flex-1 space-y-2">
            {slices.map((slice) => (
              <li key={slice.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-[#202124]">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: slice.color }}
                    aria-hidden
                  />
                  <span className="truncate">{slice.label}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatRial(slice.amountRial)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function positiveAmount(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  try {
    if (isZeroDecimal(value)) return '0';
    return value;
  } catch {
    return null;
  }
}

function formatShare(percent: number | null): string {
  if (percent == null) return '—';
  return `${toPersianDigits(String(percent))}٪`;
}

const PIE_CX = 70;
const PIE_CY = 70;
const PIE_OUTER = 62;
const PIE_INNER = 38;

function Donut({
  slices,
  total,
  summary,
}: {
  slices: AssetCompositionSlice[];
  total: string;
  summary: string;
}) {
  const unitsTotal = slices.reduce((sum, slice) => sum + positiveUnits(slice.amountRial), BigInt(0));
  const wedges = pieWedges(slices, unitsTotal);
  const center = formatWholeMoney(total).replace(' تومان', '');

  return (
    <div className="relative h-[140px] w-[140px] shrink-0">
      <svg
        viewBox="0 0 140 140"
        className="h-full w-full"
        role="img"
        aria-label={`نمودار دایره‌ای ترکیب دارایی. ارزش کل ${formatRial(total)}. ${summary}`}
      >
        {wedges.length === 0 ? (
          <circle cx={PIE_CX} cy={PIE_CY} r={PIE_OUTER} fill="#E5E7EB" />
        ) : null}
        {wedges.map((wedge) =>
          wedge.full ? (
            <g key={wedge.id}>
              <circle cx={PIE_CX} cy={PIE_CY} r={PIE_OUTER} fill={wedge.color} />
              <circle cx={PIE_CX} cy={PIE_CY} r={PIE_INNER} fill="#FFFFFF" />
            </g>
          ) : (
            <path
              key={wedge.id}
              d={wedge.path}
              fill={wedge.color}
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          ),
        )}
        {wedges.map((wedge) => {
          if (wedge.full || wedge.share == null || wedge.share < 10) return null;
          const point = polar(PIE_CX, PIE_CY, (PIE_OUTER + PIE_INNER) / 2, wedge.midAngle);
          return (
            <text
              key={`${wedge.id}-share`}
              x={point.x}
              y={point.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={wedge.labelColor}
              fontSize={wedge.share < 16 ? 10 : 11}
              fontWeight="700"
            >
              {formatShare(wedge.share)}
            </text>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
        <span className="text-[10px] text-[#6B7280]">ارزش کل</span>
        <span className="max-w-[4.5rem] break-words text-[11px] font-bold leading-4 tabular-nums text-[#202124]">
          {center}
        </span>
        <span className="text-[10px] text-[#6B7280]">تومان</span>
      </div>
    </div>
  );
}

function pieWedges(slices: AssetCompositionSlice[], total: bigint) {
  if (total <= BigInt(0)) return [];
  const visible = slices.filter((slice) => positiveUnits(slice.amountRial) > BigInt(0));
  if (visible.length === 1) {
    const only = visible[0]!;
    return [
      {
        id: only.id,
        color: only.color,
        labelColor: only.labelColor,
        share: only.share,
        full: true as const,
        path: '',
        midAngle: 0,
      },
    ];
  }

  let startAngle = 0;
  return visible.map((slice, index) => {
    const units = positiveUnits(slice.amountRial);
    const sweep =
      index === visible.length - 1
        ? 360 - startAngle
        : Number((units * BigInt(36000)) / total) / 100;
    const endAngle = startAngle + sweep;
    const path = donutSlicePath(PIE_CX, PIE_CY, PIE_OUTER, PIE_INNER, startAngle, endAngle);
    const wedge = {
      id: slice.id,
      color: slice.color,
      labelColor: slice.labelColor,
      share: slice.share,
      full: false as const,
      path,
      midAngle: startAngle + sweep / 2,
    };
    startAngle = endAngle;
    return wedge;
  });
}

function donutSlicePath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  startAngle: number,
  endAngle: number,
): string {
  const outerStart = polar(cx, cy, outer, startAngle);
  const outerEnd = polar(cx, cy, outer, endAngle);
  const innerEnd = polar(cx, cy, inner, endAngle);
  const innerStart = polar(cx, cy, inner, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outer} ${outer} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${inner} ${inner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function polar(cx: number, cy: number, radius: number, angleDeg: number) {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function positiveUnits(value: string): bigint {
  const units = decimalUnits(value);
  if (units == null || units < BigInt(0)) return BigInt(0);
  return units;
}
