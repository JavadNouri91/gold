'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ChevronLeft, Wallet } from 'lucide-react';
import { ApiClientError, customerApi } from '@/lib/api';
import { readAvailableCredit } from '@/lib/credit-view';
import { HeaderHoverTip } from '@/components/portal/header-hover-tip';
import { cn, formatWholeMoney } from '@/lib/utils';

/** Same SWR key as the dashboard and credit page, so the header reuses that response. */
const ACCOUNT_KEY = 'customer/me/account';

/**
 * Compact header card for the signed-in customer's remaining purchasing power.
 * The amount is the server `availableRial` field, shown as whole Toman with no
 * fractional digits. Gold, reserved, and consumed buckets are not shown and
 * are not recomputed here.
 */
export function RialBalanceCard({
  variant = 'header',
  className,
}: {
  variant?: 'header' | 'drawer' | 'icon';
  className?: string;
}) {
  const { data, error, isLoading } = useSWR(ACCOUNT_KEY, () => customerApi.getMyAccount());
  const loading = isLoading && !data;
  const unavailable = error instanceof ApiClientError && error.isNotFound;
  const failed = Boolean(error) && !unavailable;
  const available = data ? readAvailableCredit(data) : null;
  const formatted = available ? formatWholeMoney(available) : null;
  const amount = formatted && formatted !== '—' ? formatted : null;

  let value = '—';
  if (failed) value = 'خطا در دریافت';
  else if (amount) value = amount;

  if (variant === 'icon') {
    return (
      <HeaderHoverTip
        tone="emerald"
        content={
          <>
            <span className="block">توان خرید</span>
            {loading ? null : <span className="mt-0.5 block font-bold tabular-nums">{value}</span>}
          </>
        }
      >
        <Link
          href="/portal/credit"
          aria-busy={loading || undefined}
          aria-label={amount ? `توان خرید، ${value}` : 'توان خرید'}
          className={cn(
            'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 shadow-sm ring-1 ring-emerald-100 transition-colors hover:bg-emerald-100 sm:h-12 sm:w-12',
            className,
          )}
        >
          <Wallet className="h-5 w-5 text-emerald-600" aria-hidden />
        </Link>
      </HeaderHoverTip>
    );
  }

  if (variant === 'drawer') {
    return (
      <Link
        href="/portal/credit"
        aria-busy={loading || undefined}
        className={cn(
          'block rounded-2xl bg-emerald-50 p-3 text-emerald-800 shadow-sm ring-1 ring-emerald-100 transition-colors hover:bg-emerald-100',
          className,
        )}
      >
        <span className="flex items-center gap-2">
          <Wallet className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-medium text-emerald-700">توان خرید شما</span>
            {loading ? (
              <span className="mt-1 block h-4 w-28 animate-pulse rounded bg-emerald-200/80" />
            ) : (
              <span className="mt-0.5 block truncate text-sm font-bold text-emerald-900">
                {value}
              </span>
            )}
          </span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/portal/credit"
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex h-11 max-w-[min(11rem,42vw)] shrink-0 items-center gap-1.5 self-center rounded-xl bg-emerald-50 px-2 text-emerald-800 shadow-sm ring-1 ring-emerald-100 transition-colors hover:bg-emerald-100 sm:h-12 sm:max-w-[16rem] sm:gap-2 sm:px-3',
        className,
      )}
    >
      <Wallet className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
      <span className="min-w-0 flex-1 text-start">
        <span className="block truncate text-[10px] font-medium leading-none text-emerald-700 sm:text-[11px]">
          توان خرید
        </span>
        {loading ? (
          <span className="mt-1 block h-3 w-14 animate-pulse rounded bg-emerald-200/80" />
        ) : (
          <span className="mt-0.5 block truncate text-[11px] font-bold leading-4 text-emerald-900 sm:text-xs">
            {value}
          </span>
        )}
      </span>
      <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
    </Link>
  );
}
