import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatSignedPercent, formatSignedRial, moneyTone, toneClass } from '@/lib/portfolio-display';
import type { PortfolioPeriod } from '@/lib/portfolio-history-preview';
import { PORTFOLIO_PERIODS } from '@/lib/portfolio-history-preview';

export const assetCardClass =
  'min-w-0 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5';

export function AssetSkeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-slate-100', className)} aria-hidden />;
}

export function PreviewNote() {
  return (
    <p className="rounded-xl bg-[#FFF4D6] px-3 py-2 text-[11px] leading-5 text-amber-900">
      نمونه نمایشی — تاریخچه دارایی از سرور دریافت نمی‌شود و موجودی شما را نشان نمی‌دهد.
    </p>
  );
}

export function SignedMoney({
  value,
  percent,
  className,
}: {
  value: string | null | undefined;
  percent?: string | null;
  className?: string;
}) {
  const tone = moneyTone(value);
  const percentLabel = formatSignedPercent(percent, tone);
  return (
    <p className={cn('font-semibold tabular-nums', toneClass(tone), className)}>
      {formatSignedRial(value)}
      {percentLabel ? <span className="mr-1 text-xs font-medium">{percentLabel}</span> : null}
    </p>
  );
}

export function PeriodPills({
  period,
  onChange,
  labelKind,
  label,
}: {
  period: PortfolioPeriod;
  onChange: (period: PortfolioPeriod) => void;
  labelKind: 'chartLabel' | 'performanceLabel';
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {PORTFOLIO_PERIODS.map((item) => {
        const active = item.id === period;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'min-h-11 rounded-full px-3 text-xs font-medium',
              active ? 'bg-[#C8922E] text-white' : 'bg-[#F8F9FA] text-[#202124] hover:bg-[#FFF4D6]',
            )}
          >
            {item[labelKind]}
          </button>
        );
      })}
    </div>
  );
}

export function MetricTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#E5E7EB] bg-[#F8F9FA] px-3 py-3">
      <p className="text-[11px] leading-5 text-[#6B7280]">{label}</p>
      <div className="mt-1 text-sm font-bold leading-6 text-[#202124]">{children}</div>
    </div>
  );
}
