import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatSignedPercent, formatSignedRial, formatSignedWholeRial, moneyTone, toneClass } from '@/lib/portfolio-display';

export const assetCardClass = 'min-w-0 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm md:p-5';

export function AssetSkeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-slate-100', className)} aria-hidden />;
}

export function SignedMoney({
  value,
  percent,
  whole = false,
  className,
}: {
  value: string | null | undefined;
  percent?: string | null;
  whole?: boolean;
  className?: string;
}) {
  const tone = moneyTone(value);
  const percentLabel = formatSignedPercent(percent, tone, whole ? { plus: false } : undefined);
  return (
    <p className={cn('font-semibold tabular-nums', toneClass(tone), className)}>
      {whole ? formatSignedWholeRial(value) : formatSignedRial(value)}
      {percentLabel ? <span className="mr-1 text-xs font-medium">{percentLabel}</span> : null}
    </p>
  );
}

export function SummaryIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF4D6] text-[#C8922E]">
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

export function CardHeading({ icon, title, id }: { icon: LucideIcon; title: string; id: string }) {
  return (
    <div className="flex items-center gap-2">
      <SummaryIcon icon={icon} />
      <h2 id={id} className="text-sm font-bold text-[#202124]">
        {title}
      </h2>
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-7 text-[#6B7280]">{children}</p>;
}
