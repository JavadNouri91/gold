import type { ReactNode } from 'react';
import { cn, formatAuthoritativeDecimal, toPersianDigits } from '@/lib/utils';
import type { CreditStatusView } from '@/lib/credit-view';

export const creditCardClass =
  'min-w-0 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5';

export function CreditSkeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-[#E5E7EB]', className)} aria-hidden />;
}

export function formatCreditAmount(value: string): string {
  return formatAuthoritativeDecimal(value, '');
}

export function formatCreditMoney(value: string): string {
  return formatAuthoritativeDecimal(value, 'ریال');
}

export function formatShare(percent: number | null): string {
  if (percent == null) return '—';
  return `${toPersianDigits(String(percent))}٪`;
}

export function signedCreditMoney(amount: string, tone: 'plus' | 'minus' | 'neutral'): string {
  const body = formatCreditMoney(amount.replace(/^-/, ''));
  if (body === '—') return body;
  if (tone === 'minus') return `−${body}`;
  if (tone === 'plus') return `+${body}`;
  return body;
}

const TONE_CLASS: Record<CreditStatusView['tone'], string> = {
  green: 'bg-green-50 text-[#16A34A]',
  amber: 'bg-amber-50 text-[#B45309]',
  red: 'bg-red-50 text-[#DC2626]',
  blue: 'bg-blue-50 text-[#2563EB]',
};

const DOT_CLASS: Record<CreditStatusView['tone'], string> = {
  green: 'bg-[#16A34A]',
  amber: 'bg-[#F59E0B]',
  red: 'bg-[#DC2626]',
  blue: 'bg-[#2563EB]',
};

export function CreditStatusPill({ status }: { status: CreditStatusView }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold',
        TONE_CLASS[status.tone],
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', DOT_CLASS[status.tone])} aria-hidden />
      {status.label}
    </span>
  );
}

export function CreditRetry({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
      <p className="text-sm text-[#202124]">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-[#202124]"
        >
          تلاش مجدد
        </button>
      ) : null}
    </div>
  );
}

export function CreditSection({
  title,
  id,
  action,
  children,
  className,
}: {
  title: string;
  id: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn(creditCardClass, className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="text-base font-bold text-[#202124]">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
