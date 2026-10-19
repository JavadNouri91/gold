'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Eye, EyeOff, PieChart } from 'lucide-react';
import {
  addDecimal,
  decimalUnits,
  isZeroDecimal,
  multiplyDecimal,
  percentOfDecimal,
} from '@/lib/decimal-string';
import { moneyTone } from '@/lib/portfolio-display';
import { cn, formatWholeMoney, formatWeight, toPersianDigits } from '@/lib/utils';
import type { PortfolioPosition } from '@/lib/customer-portfolio';
import { EmptyNote } from './assets-ui';

const SLICE_META = [
  { id: 'buying-power', label: 'توان خرید', color: '#2563EB', labelColor: '#FFFFFF' },
  { id: 'melted-gold', label: 'ارزش ریالی طلای آب شده', color: '#EAB308', labelColor: '#202124' },
  { id: 'pending-pickup', label: 'طلای در انتظار تحویل', color: '#C026D3', labelColor: '#FFFFFF' },
] as const;

const MASKED_MONEY = '•••••••• تومان';

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
  const [hidden, setHidden] = useState(false);
  const pendingRial = pendingPickupValueRial(position?.reservedPickupGrams, livePriceRial);
  const slices = assetCompositionSlices(availableRial, position?.marketValueRial, pendingRial);
  const total = slices.reduce((sum, slice) => addDecimal(sum, slice.amountRial), '0');
  const hasValue = !isZeroDecimal(total);
  const summary = slices.map((slice) => `${slice.label} ${formatShare(slice.share)}`).join('، ');
  const profit = profitBadge(position?.changePercent, position?.unrealizedPnlRial);

  return (
    <section
      aria-labelledby="composition-title"
      dir="rtl"
      className="flex h-full min-w-0 flex-col rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-sm md:p-6"
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F5E6C8] text-[#C8922E]">
            <PieChart className="h-4 w-4" aria-hidden />
          </span>
          <h2 id="composition-title" className="text-base font-bold text-[#202124]">
            ترکیب دارایی
          </h2>
        </div>
        <button
          type="button"
          aria-pressed={hidden}
          aria-label={hidden ? 'نمایش مبالغ' : 'مخفی کردن مبالغ'}
          onClick={() => setHidden((value) => !value)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#9CA3AF] hover:bg-[#F8F9FA] hover:text-[#6B7280]"
        >
          {hidden ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
        </button>
      </header>

      {!hasValue ? (
        <div className="mt-4 flex flex-1 items-center">
          <EmptyNote>ترکیب دارایی پس از ثبت توان خرید یا موجودی طلا نمایش داده می‌شود.</EmptyNote>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <div className="w-full min-w-0 flex-1 rounded-2xl bg-[#FAF6EE] px-4 py-4 text-right">
              <p className="text-sm text-[#8A6A24]">ارزش کل دارایی</p>
              <p className="mt-1 text-xl font-bold leading-8 tracking-tight text-[#202124] sm:text-2xl">
                {hidden ? MASKED_MONEY : formatWholeMoney(total)}
              </p>
              {profit && !hidden ? (
                <p
                  className={cn(
                    'mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                    profit.tone === 'positive' ? 'bg-[#E8F8EE] text-[#15803D]' : 'bg-red-50 text-[#DC2626]',
                  )}
                >
                  {profit.label}
                </p>
              ) : null}
            </div>
            <div className="h-[148px] w-[148px] shrink-0">
              <CompositionDonut slices={slices} total={total} summary={summary} />
            </div>
          </div>

          <ul className="mt-6 space-y-4">
            {slices.map((slice) => {
              const muted = isZeroDecimal(slice.amountRial);
              return (
                <li key={slice.id} className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-start gap-2">
                    <span
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: slice.color }}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className={cn('block text-sm font-medium', muted ? 'text-[#9CA3AF]' : 'text-[#202124]')}>
                        {slice.label}
                      </span>
                      {slice.id === 'melted-gold' && position?.weightGrams && !isZeroDecimal(position.weightGrams) ? (
                        <span className="mt-0.5 block text-xs text-[#9CA3AF]">
                          {hidden ? '(••••)' : `(معادل ${formatWeight(position.weightGrams)} طلا)`}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-sm font-bold tabular-nums',
                      muted ? 'text-[#9CA3AF]' : 'text-[#202124]',
                    )}
                  >
                    {hidden ? MASKED_MONEY : formatWholeMoney(slice.amountRial)}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
        <Link
          href="/portal/orders/new?side=buy"
          className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-2xl bg-[#059669] px-3 text-sm font-bold text-white hover:bg-[#047857]"
        >
          <ArrowUp className="h-4 w-4" aria-hidden />
          خرید طلا
        </Link>
        <Link
          href="/portal/orders/new?side=sell"
          className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-2xl bg-[#B93846] px-3 text-sm font-bold text-white hover:bg-[#A12E3B]"
        >
          <ArrowDown className="h-4 w-4" aria-hidden />
          فروش طلا
        </Link>
      </div>
    </section>
  );
}

function profitBadge(percent: string | null | undefined, pnlRial: string | null | undefined) {
  const tone = moneyTone(pnlRial ?? percent);
  if (tone === 'neutral' || percent == null || percent.trim() === '') return null;
  const digits = toPersianDigits(percent.trim().replace(/^-/, ''));
  const sign = tone === 'negative' ? '−' : '+';
  return {
    tone,
    label: `${sign}${digits}٪ (${tone === 'negative' ? 'زیان' : 'سود'})`,
  };
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

function CompositionDonut({
  slices,
  total,
  summary,
}: {
  slices: AssetCompositionSlice[];
  total: string;
  summary: string;
}) {
  const unitsTotal = slices.reduce((sum, slice) => sum + positiveUnits(slice.amountRial), BigInt(0));
  const wedges = donutWedges(slices, unitsTotal);

  return (
    <div className="relative h-full w-full shrink-0" dir="ltr">
      <svg
        viewBox="0 0 140 140"
        className="h-full w-full"
        role="img"
        aria-label={`نمودار دایره‌ای ترکیب دارایی. ارزش کل ${formatWholeMoney(total)}. ${summary}`}
      >
        {wedges.length === 0 ? <circle cx={PIE_CX} cy={PIE_CY} r={PIE_OUTER} fill="#E5E7EB" /> : null}
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
          if (wedge.share == null || wedge.share < 8) return null;
          const point = polar(PIE_CX, PIE_CY, (PIE_OUTER + PIE_INNER) / 2, wedge.full ? 0 : wedge.midAngle);
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
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
        <GoldIngotIcon />
      </div>
    </div>
  );
}

function GoldIngotIcon() {
  return (
    <svg viewBox="0 0 32 28" className="h-7 w-8 text-[#EAB308]" fill="currentColor">
      <path d="M8 6h16l3 6H5L8 6Z" opacity="0.95" />
      <path d="M6 14h20l2.5 6H3.5L6 14Z" opacity="0.8" />
      <path d="M4.5 22h23l1.5 4H3l1.5-4Z" />
    </svg>
  );
}

function donutWedges(slices: AssetCompositionSlice[], total: bigint) {
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
      index === visible.length - 1 ? 360 - startAngle : Number((units * BigInt(36000)) / total) / 100;
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
