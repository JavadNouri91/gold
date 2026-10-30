'use client';

import { CheckCircle2, Clock3, Layers, Wallet, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { SkeletonBlock } from '@/components/dashboard/states';
import type { StaffDirectionSummary, StaffPaymentSummary } from '@/lib/internal-api';
import { cn, formatFaNumber, formatMoney } from '@/lib/utils';

type Tone = 'emerald' | 'amber' | 'sky' | 'blue';

const TONES: Record<Tone, { chip: string; accent: string }> = {
  emerald: { chip: 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100', accent: 'from-emerald-400 to-transparent' },
  amber: { chip: 'bg-amber-50 text-amber-700 group-hover:bg-amber-100', accent: 'from-amber-400 to-transparent' },
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
}: {
  id: string;
  title: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: Tone;
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
            <p className="mt-2 truncate text-2xl font-bold tabular-nums" title={value}>
              {value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </div>
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors', tones.chip)}>
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function PaymentHeroCards({
  summary,
  direction,
  isLoading = false,
}: {
  summary: StaffPaymentSummary | null | undefined;
  direction: 'DEPOSIT' | 'WITHDRAWAL';
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

  const bucket: StaffDirectionSummary | null | undefined =
    summary?.[direction === 'DEPOSIT' ? 'deposits' : 'withdrawals'];
  const isWithdrawal = direction === 'WITHDRAWAL';

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="خلاصه واریز و برداشت">
      <HeroCard
        id="hero-total"
        title={isWithdrawal ? 'مجموع برداشت‌های تأییدشده' : 'مجموع واریزی‌های تأییدشده'}
        tone="emerald"
        icon={CheckCircle2}
        value={bucket ? formatMoney(bucket.totalSuccessfulAmountRial) : '—'}
        hint={bucket ? `${formatFaNumber(bucket.totalCount)} تراکنش` : '—'}
      />
      <HeroCard
        id="hero-today"
        title={isWithdrawal ? 'برداشت امروز' : 'واریز امروز'}
        tone="sky"
        icon={Wallet}
        value={bucket ? formatMoney(bucket.todayValidatedAmountRial) : '—'}
        hint="تأییدشده امروز"
      />
      <HeroCard
        id="hero-pending"
        title="در انتظار تأیید"
        tone="amber"
        icon={Clock3}
        value={bucket ? formatMoney(bucket.pendingAmountRial) : '—'}
        hint={bucket ? `${formatFaNumber(bucket.pendingCount)} مورد` : '—'}
      />
      <HeroCard
        id="hero-count"
        title="تعداد کل"
        tone="blue"
        icon={Layers}
        value={bucket ? formatFaNumber(bucket.totalCount) : '—'}
        hint="همه وضعیت‌ها"
      />
    </section>
  );
}
