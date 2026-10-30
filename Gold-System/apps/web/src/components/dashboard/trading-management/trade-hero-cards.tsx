'use client';

import type { ReactNode } from 'react';
import { ArrowLeftRight, CheckCircle2, DollarSign, Scale, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { SkeletonBlock } from '@/components/dashboard/states';
import type { TradeSummary } from '@/lib/internal-api';
import {
  cn,
  formatCompactToman,
  formatFaNumber,
  formatWeight,
  formatWholeMoney,
  toPersianDigits,
} from '@/lib/utils';

type Tone = 'gold' | 'emerald' | 'sky' | 'blue';

const TONES: Record<Tone, { chip: string; accent: string }> = {
  gold: { chip: 'bg-gold-50 text-gold-700 group-hover:bg-gold-100', accent: 'from-gold-400 to-transparent' },
  emerald: { chip: 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100', accent: 'from-emerald-400 to-transparent' },
  sky: { chip: 'bg-sky-50 text-sky-700 group-hover:bg-sky-100', accent: 'from-sky-400 to-transparent' },
  blue: { chip: 'bg-blue-50 text-blue-700 group-hover:bg-blue-100', accent: 'from-blue-400 to-transparent' },
};

function HeroCard({
  id,
  title,
  value,
  hint,
  icon: Icon,
  tone,
  children,
}: {
  id: string;
  title: string;
  value: ReactNode;
  hint: ReactNode;
  icon: LucideIcon;
  tone: Tone;
  children?: ReactNode;
}) {
  const tones = TONES[tone];
  return (
    <Card className="group relative overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-gold-300 hover:shadow-md motion-reduce:transform-none">
      <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-l', tones.accent)} aria-hidden />
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p id={id} className="text-sm text-muted-foreground">
              {title}
            </p>
            <p className="mt-2 truncate text-2xl font-bold tabular-nums" title={typeof value === 'string' ? value : undefined}>
              {value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </div>
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
              tones.chip,
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function BuySellBar({ summary }: { summary: TradeSummary }) {
  const buy = summary.buyRatioPercent ?? 0;
  const sell = 100 - buy;
  const label =
    summary.buyRatioPercent == null
      ? 'نسبت خرید به فروش نامشخص است'
      : `${toPersianDigits(String(summary.buyRatioPercent))}٪ خرید و ${toPersianDigits(String(sell))}٪ فروش`;

  if (summary.buyRatioPercent == null) {
    return (
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={label} />
    );
  }

  return (
    <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-gold-200" role="img" aria-label={label}>
      <div className="h-full bg-emerald-500" style={{ width: `${buy}%` }} />
      <div className="h-full bg-gold-500" style={{ width: `${sell}%` }} />
    </div>
  );
}

export function TradeHeroCards({
  summary,
  isLoading = false,
}: {
  summary: TradeSummary | null | undefined;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="در حال بارگذاری">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-28" />
        ))}
      </div>
    );
  }

  const has = summary != null;

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="خلاصه معاملات">
      <HeroCard
        id="hero-weight"
        title="حجم کل معاملات"
        tone="emerald"
        icon={Scale}
        value={has ? formatWeight(summary.totalWeightGrams) : '—'}
        hint={
          has
            ? `${formatFaNumber(summary.totalTrades)} معامله`
            : '—'
        }
      />

      <HeroCard
        id="hero-turnover"
        title="ارزش کل معاملات"
        tone="gold"
        icon={DollarSign}
        value={has ? formatCompactToman(summary.totalTurnoverRial) : '—'}
        hint={
          has ? (
            <span className="sr-only">{formatWholeMoney(summary.totalTurnoverRial)}</span>
          ) : (
            '—'
          )
        }
      />

      <HeroCard
        id="hero-ratio"
        title="نسبت خرید به فروش"
        tone="sky"
        icon={ArrowLeftRight}
        value={
          has && summary.buyRatioPercent != null
            ? `${formatFaNumber(summary.buyRatioPercent)}٪ خرید`
            : '—'
        }
        hint={
          has
            ? `${formatFaNumber(summary.buy.count)} خرید / ${formatFaNumber(summary.sell.count)} فروش`
            : '—'
        }
      >
        {has ? <BuySellBar summary={summary} /> : null}
      </HeroCard>

      <HeroCard
        id="hero-confirmed"
        title="معاملات موفق"
        tone="blue"
        icon={CheckCircle2}
        value={has ? formatFaNumber(summary.confirmedTrades) : '—'}
        hint={
          has
            ? `${formatFaNumber(summary.reversedTrades)} برگشت داده شده`
            : '—'
        }
      />
    </section>
  );
}
