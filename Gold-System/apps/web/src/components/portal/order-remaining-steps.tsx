import { ORDER_PROGRESS_STEPS, orderProgress } from '@/lib/order-progress';
import { cn } from '@/lib/utils';

export function OrderRemainingSteps({
  status,
  compact = false,
}: {
  status: string;
  compact?: boolean;
}) {
  const progress = orderProgress(status);

  if (progress.terminal === 'rejected') {
    return <p className="text-sm text-[#DC2626]">این سفارش رد شده و مسیر بررسی بسته است.</p>;
  }
  if (progress.terminal === 'cancelled') {
    return <p className="text-sm text-[#6B7280]">این سفارش لغو شده است.</p>;
  }

  if (compact) {
    return progress.remainingLabel ? (
      <p className="text-xs text-[#6B7280]">{progress.remainingLabel}</p>
    ) : (
      <p className="text-xs text-[#16A34A]">مسیر سفارش تکمیل شده است.</p>
    );
  }

  return (
    <div className="space-y-3">
      <ol className="grid gap-2 sm:grid-cols-2">
        {ORDER_PROGRESS_STEPS.map((step, index) => {
          const done =
            progress.terminal === 'completed' ||
            (progress.currentIndex > index && progress.currentIndex >= 0);
          const current = progress.terminal === null && progress.currentIndex === index;
          return (
            <li
              key={step.id}
              className={cn(
                'rounded-xl border px-3 py-2 text-sm',
                done && 'border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]',
                current && 'border-[#F5D48A] bg-[#FFF8EB] text-[#92400E]',
                !done && !current && 'border-[#E5E7EB] bg-white text-[#9CA3AF]',
              )}
            >
              <span className="ml-2 tabular-nums">{(index + 1).toLocaleString('fa-IR')}</span>
              {step.label}
              {current ? <span className="mr-2 text-xs">مرحله جاری</span> : null}
            </li>
          );
        })}
      </ol>
      {progress.remainingLabel ? (
        <p className="text-sm leading-7 text-[#374151]">{progress.remainingLabel}</p>
      ) : (
        <p className="text-sm text-[#16A34A]">همه مراحل تا تسویه انجام شده است.</p>
      )}
    </div>
  );
}
