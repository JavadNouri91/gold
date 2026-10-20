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

/**
 * For cancelled pickups, freeze the stepper at the last sequential step that was reached
 * (READY → PREPARING → REQUESTED). Prefer timestamps/events over inventing progress.
 */
export function cancelledReachedIndex(stepAt?: PickupStepTimestamps): number {
  if (stepAt?.READY) return STEPS.indexOf('READY');
  if (stepAt?.PREPARING) return STEPS.indexOf('PREPARING');
  return STEPS.indexOf('REQUESTED');
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

function StepNode({
  done,
  current,
  reached,
  compact,
  index,
}: {
  done: boolean;
  current: boolean;
  reached: boolean;
  compact: boolean;
  index: number;
}) {
  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full font-bold transition-colors',
        compact ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-[11px]',
        (done || current) && 'bg-emerald-500 text-white',
        current && 'shadow-[0_0_0_4px_rgba(16,185,129,0.25)]',
        !reached && 'bg-slate-200 text-slate-400',
      )}
    >
      {current ? (
        <span
          className="absolute inset-0 animate-pulse rounded-full bg-emerald-400/40"
          aria-hidden
        />
      ) : null}
      {done || current ? (
        <Check
          className={cn('relative z-[1]', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')}
          strokeWidth={3}
          aria-hidden
        />
      ) : (
        <span className="relative z-[1]">{toPersianDigits(String(index + 1))}</span>
      )}
    </span>
  );
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
  const cancelled = status === 'CANCELLED';
  const currentIndex = cancelled
    ? cancelledReachedIndex(stepAt)
    : Math.max(0, STEPS.indexOf(status));
  const allDone = status === 'DELIVERED';
  const completedCount = allDone ? STEPS.length : currentIndex + 1;
  const progressPercent =
    STEPS.length <= 1 ? 100 : Math.round((currentIndex / (STEPS.length - 1)) * 100);
  const progressLabel = `${toPersianDigits(String(completedCount))} از ${toPersianDigits(String(STEPS.length))} مرحله`;

  return (
    <div className={cn('w-full', compact ? 'space-y-2' : 'space-y-3')}>
      {!compact && !cancelled ? (
        <p className="text-xs text-muted-foreground">{progressLabel}</p>
      ) : null}

      {/* Mobile: vertical timeline */}
      <ol
        className={cn('space-y-0 md:hidden', compact ? 'ps-1' : 'ps-1.5')}
        aria-label="مراحل تحویل حضوری"
      >
        {STEPS.map((step, index) => {
          const reached = index <= currentIndex;
          // Cancelled freezes progress: all reached steps are solid green (no pulse).
          const done = reached && (cancelled || index < currentIndex || allDone);
          const current = index === currentIndex && !allDone && !cancelled;
          const atLabel = reached ? formatStepDate(stepAt?.[step], compact) : null;
          const isLast = index === STEPS.length - 1;
          const lineFilled = index < currentIndex || allDone || (cancelled && index < currentIndex);
          return (
            <li key={step} className="relative flex gap-3 pb-4 last:pb-0">
              {!isLast ? (
                <span
                  className={cn(
                    'absolute start-[9px] top-5 bottom-0 w-0.5 -translate-x-1/2',
                    compact && 'start-[7.5px] top-4',
                    lineFilled ? 'bg-emerald-500' : 'bg-slate-200',
                  )}
                  aria-hidden
                />
              ) : null}
              <div className="relative z-[1] flex flex-col items-center">
                <StepNode
                  done={done}
                  current={current}
                  reached={reached}
                  compact={compact}
                  index={index}
                />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <span
                  className={cn(
                    'inline-block leading-4',
                    compact ? 'text-[10px]' : 'text-xs',
                    (done || current) && 'font-medium text-emerald-800',
                    current && 'rounded-md bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-900',
                    !reached && 'text-slate-400',
                  )}
                >
                  {PICKUP_STATUS_LABELS[step]}
                </span>
                {atLabel ? (
                  <time
                    dateTime={stepAt?.[step] ?? undefined}
                    className={cn(
                      'mt-0.5 block tabular-nums leading-3 text-emerald-700',
                      compact ? 'text-[9px]' : 'text-[10px]',
                    )}
                  >
                    {atLabel}
                  </time>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Desktop: horizontal connected track */}
      <div
        className="relative hidden md:block"
        role="progressbar"
        aria-label="پیشرفت تحویل حضوری"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        aria-valuetext={progressLabel}
      >
        <div
          className={cn(
            'absolute start-[12.5%] end-[12.5%] top-[11px] h-1.5 rounded-full bg-slate-200',
            compact && 'top-[9px] h-1',
          )}
          aria-hidden
        />
        <div
          className={cn(
            'absolute start-[12.5%] top-[11px] h-1.5 rounded-full bg-emerald-500 transition-[width] duration-300',
            compact && 'top-[9px] h-1',
          )}
          style={{
            width: `${STEPS.length <= 1 ? 75 : (currentIndex / (STEPS.length - 1)) * 75}%`,
          }}
          aria-hidden
        />

        <ol className="relative z-[1] flex w-full items-start justify-between" aria-label="مراحل تحویل حضوری">
          {STEPS.map((step, index) => {
            const reached = index <= currentIndex;
            const done = reached && (cancelled || index < currentIndex || allDone);
            const current = index === currentIndex && !allDone && !cancelled;
            const atLabel = reached ? formatStepDate(stepAt?.[step], compact) : null;
            return (
              <li key={step} className="flex w-1/4 flex-col items-center gap-1">
                <StepNode
                  done={done}
                  current={current}
                  reached={reached}
                  compact={compact}
                  index={index}
                />
                <span
                  className={cn(
                    'w-full px-0.5 text-center leading-4',
                    compact ? 'text-[10px]' : 'text-xs',
                    (done || current) && 'font-medium text-emerald-800',
                    current &&
                      'mx-auto w-fit rounded-md bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-900',
                    !reached && 'text-slate-400',
                  )}
                >
                  {PICKUP_STATUS_LABELS[step]}
                </span>
                {atLabel ? (
                  <time
                    dateTime={stepAt?.[step] ?? undefined}
                    className={cn(
                      'w-full px-0.5 text-center tabular-nums leading-3 text-emerald-700',
                      compact ? 'text-[9px]' : 'text-[10px]',
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
