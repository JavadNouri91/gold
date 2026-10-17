'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ChevronLeft, Package } from 'lucide-react';
import { ordersApi } from '@/lib/api';
import { isZeroDecimal } from '@/lib/decimal-string';
import { HeaderHoverTip } from '@/components/portal/header-hover-tip';
import { cn, formatWeight } from '@/lib/utils';

const PORTFOLIO_KEY = 'orders/portfolio';

/**
 * Compact header chip for grams reserved for in-store pickup
 * (REQUESTED / PREPARING / READY). Shown beside the KYC cue.
 */
export function PendingPickupCard({
  variant = 'header',
  className,
}: {
  variant?: 'header' | 'drawer' | 'icon';
  className?: string;
}) {
  const { data: holding, error, isLoading } = useSWR(PORTFOLIO_KEY, () => ordersApi.portfolio());
  const loading = isLoading && !holding && !error;
  const reserved = holding?.reservedPickupGrams ?? '0';
  const hasPending = holding != null && !isZeroDecimal(reserved);
  const href = hasPending ? '/portal/pickups' : '/portal/pickups/new';
  const value = holding ? formatWeight(reserved) : '—';

  if (variant === 'icon') {
    return (
      <HeaderHoverTip
        tone="amber"
        content={
          <>
            <span className="block">طلای در انتظار تحویل</span>
            {loading ? null : <span className="mt-0.5 block font-bold tabular-nums">{value}</span>}
          </>
        }
      >
        <Link
          href={href}
          aria-busy={loading || undefined}
          aria-label={holding ? `طلای در انتظار تحویل، ${value}` : 'طلای در انتظار تحویل'}
          className={cn(
            'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-900 shadow-sm ring-1 ring-amber-100 transition-colors hover:bg-amber-100 sm:h-12 sm:w-12',
            className,
          )}
        >
          <Package className="h-5 w-5 text-amber-700" aria-hidden />
        </Link>
      </HeaderHoverTip>
    );
  }

  if (variant === 'drawer') {
    return (
      <Link
        href={href}
        aria-busy={loading || undefined}
        className={cn(
          'block rounded-2xl bg-amber-50 p-3 text-amber-900 shadow-sm ring-1 ring-amber-100 transition-colors hover:bg-amber-100',
          className,
        )}
      >
        <span className="flex items-center gap-2">
          <Package className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-medium text-amber-800">طلای در انتظار تحویل</span>
            {loading ? (
              <span className="mt-1 block h-4 w-20 animate-pulse rounded bg-amber-200/80" />
            ) : (
              <span className="mt-0.5 block truncate text-sm font-bold text-amber-950">{value}</span>
            )}
          </span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex h-11 max-w-[min(10.5rem,38vw)] shrink-0 items-center gap-1.5 self-center rounded-xl bg-amber-50 px-2 text-amber-900 shadow-sm ring-1 ring-amber-100 transition-colors hover:bg-amber-100 sm:h-12 sm:max-w-[14rem] sm:gap-2 sm:px-3',
        className,
      )}
    >
      <Package className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      <span className="min-w-0 flex-1 text-start">
        <span className="block truncate text-[10px] font-medium leading-none text-amber-800 sm:text-[11px]">
          طلای در انتظار تحویل
        </span>
        {loading ? (
          <span className="mt-1 block h-3 w-12 animate-pulse rounded bg-amber-200/80" />
        ) : (
          <span className="mt-0.5 block truncate text-[11px] font-bold leading-4 text-amber-950 sm:text-xs">
            {value}
          </span>
        )}
      </span>
      <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
    </Link>
  );
}
