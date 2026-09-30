import { cn } from '@/lib/utils';
import type { CreditFigures } from '@/lib/credit-view';
import { creditCardClass, formatCreditAmount, formatShare } from './credit-ui';

export function CreditLimitCard({
  figures,
  className,
}: {
  figures: CreditFigures;
  className?: string;
}) {
  const used = figures.usedPercent ?? 0;
  const remaining =
    figures.availablePercent == null ? null : figures.availablePercent;
  return (
    <section
      aria-labelledby="credit-limit-title"
      className={cn(
        creditCardClass,
        'border-[#E7D3A1] bg-[#FFF9EE]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="credit-limit-title" className="text-sm font-bold text-[#202124]">
          سقف اعتبار شما
        </h2>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFF4D6] text-[#C8922E]"
          aria-hidden
        >
          <ScaleIcon />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold leading-8 tabular-nums tracking-tight text-[#202124] sm:text-3xl">
        {formatCreditAmount(figures.limit)}
      </p>
      <p className="mt-1 text-xs text-[#6B7280]">ریال</p>
      <p className="mt-4 text-sm font-semibold text-[#202124]">
        {formatShare(figures.usedPercent)} استفاده شده
      </p>
      <div
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#E5E7EB]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={figures.usedPercent ?? 0}
        aria-label="درصد استفاده از سقف اعتبار"
      >
        <div
          className="h-full rounded-full bg-[#C8922E]"
          style={{ width: `${Math.min(100, Math.max(0, used))}%` }}
        />
      </div>
      <p className="sr-only">
        {remaining == null ? '' : `${formatShare(remaining)} از سقف اعتبار باقی مانده است.`}
      </p>
    </section>
  );
}

function ScaleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v18M4 8h16M7 8l-3 6h6L7 8zm10 0-3 6h6l-3-6z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
