import { ORDER_PROGRESS_STEPS, orderProgress } from '@/lib/order-progress';
import { cn, formatFaNumber } from '@/lib/utils';

function stepState(status: string, index: number) {
  const progress = orderProgress(status);
  if (progress.terminal === 'rejected' || progress.terminal === 'cancelled') {
    return { done: false, current: false, stopped: true as const };
  }
  const done =
    progress.terminal === 'completed' ||
    (progress.currentIndex > index && progress.currentIndex >= 0);
  const current = progress.terminal === null && progress.currentIndex === index;
  return { done, current, stopped: false as const };
}

export function OrderTimeline({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const progress = orderProgress(status);
  const stopped = progress.terminal === 'rejected' || progress.terminal === 'cancelled';

  return (
    <div className={cn('space-y-2', className)}>
      <ol aria-label="مراحل سفارش" className="flex w-full items-start">
        {ORDER_PROGRESS_STEPS.map((step, index) => {
          const { done, current } = stepState(status, index);
          const last = index === ORDER_PROGRESS_STEPS.length - 1;
          return (
            <li key={step.id} className={cn('flex min-w-0 items-start', last ? 'shrink-0' : 'flex-1')}>
              <div className="flex w-11 shrink-0 flex-col items-center sm:w-14">
                <span
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold tabular-nums',
                    done && 'border-[#16A34A] bg-[#16A34A] text-white',
                    current && 'border-[#C8922E] bg-[#C8922E] text-white ring-4 ring-[#C8922E]/20',
                    !done && !current && !stopped && 'border-[#D1D5DB] bg-white text-[#9CA3AF]',
                    stopped && 'border-[#E5E7EB] bg-[#F3F4F6] text-[#9CA3AF]',
                  )}
                >
                  {formatFaNumber(index + 1)}
                </span>
                <span
                  className={cn(
                    'mt-1 text-center text-[10px] leading-4 sm:text-[11px]',
                    current && 'font-semibold text-[#92400E]',
                    done && 'text-[#166534]',
                    !done && !current && 'text-[#9CA3AF]',
                  )}
                >
                  {step.label}
                </span>
              </div>
              {last ? null : (
                <span
                  aria-hidden
                  className={cn(
                    'mt-2.5 h-0.5 min-w-2 flex-1 rounded-full',
                    done ? 'bg-[#16A34A]' : stopped ? 'bg-[#E5E7EB]' : 'bg-[#E5E7EB]',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
      {progress.terminal === 'rejected' ? (
        <p className="text-xs text-[#DC2626]">این سفارش رد شده و مسیر بررسی بسته است.</p>
      ) : progress.terminal === 'cancelled' ? (
        <p className="text-xs text-[#6B7280]">این سفارش لغو شده است.</p>
      ) : progress.remainingLabel ? (
        <p className="text-xs text-[#6B7280]">{progress.remainingLabel}</p>
      ) : (
        <p className="text-xs text-[#16A34A]">مسیر سفارش تکمیل شده است.</p>
      )}
    </div>
  );
}

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

  return <OrderTimeline status={status} />;
}
