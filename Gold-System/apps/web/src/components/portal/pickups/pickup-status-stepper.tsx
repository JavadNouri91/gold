'use client';

import { Check } from 'lucide-react';
import { cn, toPersianDigits } from '@/lib/utils';
import type { PhysicalGoldPickup, PhysicalGoldPickupStatus } from '@/lib/api';
import { PICKUP_STATUS_LABELS } from '@/lib/utils';

const STEPS: PhysicalGoldPickupStatus[] = ['REQUESTED', 'PREPARING', 'READY', 'DELIVERED'];

export type PickupStepTimestamps = Partial<
  Record<'REQUESTED' | 'PREPARING' | 'READY' | 'DELIVERED', string | null>
>;

/** Prefer column timestamps; fall back to the first matching status event. */
export function pickupStepTimestamps(pickup: PhysicalGoldPickup): PickupStepTimestamps {
  const fromEvents: PickupStepTimestamps = {};
  for (const event of pickup.events ?? []) {
    if (STEPS.includes(event.status) && !fromEvents[event.status as keyof PickupStepTimestamps]) {
      fromEvents[event.status as keyof PickupStepTimestamps] = event.createdAt;
    }
  }
  return {
    REQUESTED: pickup.requestedAt ?? fromEvents.REQUESTED ?? null,
    PREPARING: pickup.preparingAt ?? fromEvents.PREPARING ?? null,
    READY: pickup.readyAt ?? fromEvents.READY ?? null,
    DELIVERED: pickup.deliveredAt ?? fromEvents.DELIVERED ?? null,
  };
}

function formatStepDate(iso: string | null | undefined, compact: boolean): string | null {
  if (!iso) return null;
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    if (compact) {
      return toPersianDigits(
        date.toLocaleDateString('fa-IR', {
          month: 'short',
          day: 'numeric',
        }),
      );
    }
    return toPersianDigits(
      date.toLocaleString('fa-IR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
  } catch {
    return null;
  }
}

export function PickupStatusStepper({
  status,
  stepAt,
  compact = false,
}: {
  status: PhysicalGoldPickupStatus;
  /** ISO timestamps for each reached step (shown under the label). */
  stepAt?: PickupStepTimestamps;
  compact?: boolean;
}) {
  if (status === 'CANCELLED') {
    return (
      <div
        className={cn(
          'rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-medium text-red-700',
          compact ? 'text-xs' : 'text-sm',
        )}
        role="status"
      >
        {PICKUP_STATUS_LABELS.CANCELLED}
      </div>
    );
  }

  const currentIndex = STEPS.indexOf(status);
  const completedCount = currentIndex + 1;
  const progressPercent =
    STEPS.length <= 1 ? 100 : Math.round((currentIndex / (STEPS.length - 1)) * 100);

  const progressLabel = `${toPersianDigits(String(completedCount))} از ${toPersianDigits(String(STEPS.length))} مرحله`;

  return (
    <div className={cn('w-full', compact ? 'space-y-2' : 'space-y-3')}>
      {!compact ? (
        <p className="text-xs text-muted-foreground">{progressLabel}</p>
      ) : null}
      <div
        className="relative"
        role="progressbar"
        aria-label="پیشرفت تحویل حضوری"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        aria-valuetext={progressLabel}
      >
        {/* Track behind the nodes */}
        <div
          className={cn(
            'absolute start-[12.5%] end-[12.5%] top-[11px] h-1.5 rounded-full bg-slate-200',
            compact && 'top-[9px] h-1',
          )}
          aria-hidden
        />
        {/* Filled progress */}
        <div
          className={cn(
            'absolute start-[12.5%] top-[11px] h-1.5 rounded-full bg-amber-500 transition-[width] duration-300',
            compact && 'top-[9px] h-1',
          )}
          style={{
            width: `${STEPS.length <= 1 ? 75 : (currentIndex / (STEPS.length - 1)) * 75}%`,
          }}
          aria-hidden
        />

        <ol className="relative z-[1] flex w-full items-start justify-between" aria-label="مراحل تحویل حضوری">
          {STEPS.map((step, index) => {
            const allDone = status === 'DELIVERED';
            const done = index < currentIndex || allDone;
            const current = index === currentIndex && !allDone;
            const reached = index <= currentIndex;
            const atLabel = reached ? formatStepDate(stepAt?.[step], compact) : null;
            return (
              <li key={step} className="flex w-1/4 flex-col items-center gap-1">
                <span
                  className={cn(
                    'flex shrink-0 items-center justify-center rounded-full border-2 font-bold transition-colors',
                    compact ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-[11px]',
                    done && 'border-emerald-500 bg-emerald-500 text-white',
                    current && 'border-amber-500 bg-white text-amber-700 shadow-[0_0_0_3px_rgba(245,158,11,0.25)]',
                    !reached && 'border-slate-300 bg-white text-slate-400',
                  )}
                >
                  {done ? (
                    <Check className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} strokeWidth={3} aria-hidden />
                  ) : (
                    toPersianDigits(String(index + 1))
                  )}
                </span>
                <span
                  className={cn(
                    'w-full px-0.5 text-center leading-4',
                    compact ? 'text-[10px]' : 'text-xs',
                    done && 'font-medium text-emerald-800',
                    current && 'font-semibold text-amber-900',
                    !reached && 'text-slate-400',
                  )}
                >
                  {PICKUP_STATUS_LABELS[step]}
                </span>
                {atLabel ? (
                  <time
                    dateTime={stepAt?.[step] ?? undefined}
                    className={cn(
                      'w-full px-0.5 text-center tabular-nums leading-3',
                      compact ? 'text-[9px]' : 'text-[10px]',
                      done && 'text-emerald-700',
                      current && 'text-amber-800',
                      !done && !current && 'text-muted-foreground',
                    )}
                  >
                    {atLabel}
                  </time>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
