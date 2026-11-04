'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { StatusBadge } from '@/components/portal/status-badge';
import type { PhysicalGoldPickup } from '@/lib/api';
import { pickupStatusHint } from '@/lib/pickup-workflow';
import { PICKUP_STATUS_LABELS, statusLabel, toPersianDigits } from '@/lib/utils';

export function PickupDetailHeader({
  pickup,
  backHref = '/dashboard/pickups',
}: {
  pickup: PhysicalGoldPickup;
  backHref?: string;
}) {
  return (
    <header className="space-y-5 pb-2">
      <Link
        href={backHref}
        className="print-screen-only inline-flex items-center gap-1 text-xs text-slate-500 hover:text-gold-800"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
        بازگشت به فهرست تحویل‌ها
      </Link>
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-gold-200 bg-gradient-to-bl from-gold-100 via-gold-300 to-gold-500 text-gold-900 shadow-sm">
          <svg viewBox="0 0 36 30" className="h-9 w-10" fill="none" aria-hidden="true">
            <path
              d="M3 16 10 5h17l6 10-8 10H8Z"
              fill="currentColor"
              fillOpacity=".12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="m3 16 21 1 9-2M24 17l1 8M10 5l14 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="min-w-0 space-y-2">
          <h1 className="text-lg font-bold leading-relaxed text-slate-950 sm:text-2xl">
            درخواست تحویل حضوری{' '}
            <bdi className="inline-block tabular-nums">{toPersianDigits(pickup.pickupNumber)}</bdi>
          </h1>
          <p className="text-sm text-slate-600 sm:text-base">
            {Number(pickup.weightGrams).toLocaleString('fa-IR', { maximumFractionDigits: 6 })} گرم
            طلای آب‌شده عیار{' '}
            {(Number(pickup.purityRatio) * 1000).toLocaleString('fa-IR', {
              maximumFractionDigits: 0,
            })}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <StatusBadge
              status={pickup.status}
              label={statusLabel(PICKUP_STATUS_LABELS, pickup.status)}
            />
            <span>{pickupStatusHint(pickup.status)}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
