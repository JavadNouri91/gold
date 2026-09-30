'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { fetchBlob, type CustomerProfile, type KycPhase } from '@/lib/api';
import { UserStatusBadge } from '@/components/portal/user-status-badge';
import { Badge } from '@/components/ui/badge';
import { toLatinDigits, toPersianDigits } from '@/lib/utils';
import { kycSummaryBadge } from './kyc-summary';

export function AccountSummarySkeleton() {
  return (
    <div
      className="rounded-[14px] border border-[#E5E7EB] bg-gradient-to-r from-[#FFFDF7] to-[#FFF4D6] p-4 md:rounded-2xl"
      aria-busy="true"
      aria-label="در حال بارگذاری حساب"
    >
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 animate-pulse rounded-full bg-white/70" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-white/80" />
          <div className="h-3 w-24 animate-pulse rounded bg-white/70" />
          <div className="h-3 w-40 animate-pulse rounded bg-white/70" />
        </div>
      </div>
    </div>
  );
}

/** Shows the mobile with the middle digits hidden. Digits stay Persian. */
export function maskMobile(value: string): string {
  const digits = toLatinDigits(value).replace(/\D/g, '');
  if (digits.length < 6) return toPersianDigits(digits);
  return toPersianDigits(`${digits.slice(0, 4)}•••••${digits.slice(-2)}`);
}

export function AccountSummary({
  customer,
  kycPhase,
  kycLoading,
  kycError,
  onRetryKyc,
}: {
  customer: CustomerProfile;
  kycPhase?: KycPhase;
  kycLoading: boolean;
  kycError: boolean;
  onRetryKyc: () => void;
}) {
  const name = `${customer.firstName} ${customer.lastName}`.trim();

  return (
    <section className="relative overflow-hidden rounded-[14px] border border-[#F3E3B3] bg-gradient-to-r from-[#FFFDF7] to-[#FFF4D6] p-4 shadow-[0_2px_8px_rgba(16,24,40,0.04)] md:rounded-2xl md:p-5">
      <div className="pointer-events-none absolute -bottom-8 left-6 h-24 w-24 rounded-full bg-[#D99A00]/10 blur-2xl" aria-hidden />
      <div className="pointer-events-none absolute left-1/4 top-0 h-16 w-32 rounded-full bg-white/50 blur-xl" aria-hidden />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <SummaryAvatar name={name} hasAvatar={Boolean(customer.hasAvatar)} updatedAt={customer.updatedAt} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-[#172033] md:text-lg">{name}</h2>
            <p className="mt-1 text-sm text-[#667085]" dir="ltr">
              {maskMobile(customer.mobile)}
            </p>
            <p className="mt-1 text-xs text-[#667085]">
              شناسه مشتری:{' '}
              <span dir="ltr" className="font-medium text-[#172033]">
                {customer.customerNumber}
              </span>
            </p>
            <div className="mt-2">
              <UserStatusBadge type={customer.type} status={customer.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#667085]">احراز هویت</span>
              <KycStatus kycPhase={kycPhase} kycLoading={kycLoading} kycError={kycError} onRetry={onRetryKyc} />
            </div>
          </div>
        </div>
        <Link
          href="/portal/profile"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 self-start rounded-lg border border-[#D99A00] bg-white px-3 text-sm font-semibold text-[#D99A00] transition-colors duration-200 hover:bg-[#FFF9E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D99A00] sm:self-center"
        >
          <Pencil className="h-4 w-4" aria-hidden />
          ویرایش پروفایل
        </Link>
      </div>
    </section>
  );
}

function KycStatus({
  kycPhase,
  kycLoading,
  kycError,
  onRetry,
}: {
  kycPhase?: KycPhase;
  kycLoading: boolean;
  kycError: boolean;
  onRetry: () => void;
}) {
  if (kycError) {
    return (
      <button
        type="button"
        className="rounded-md text-xs font-semibold text-[#D99A00] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D99A00]"
        onClick={onRetry}
      >
        تلاش مجدد
      </button>
    );
  }
  if (kycLoading || !kycPhase) {
    return <span className="inline-block h-5 w-20 animate-pulse rounded-full bg-white/70" aria-hidden />;
  }
  const badge = kycSummaryBadge(kycPhase);
  return (
    <Badge variant={badge.variant} className={badge.className}>
      {badge.label}
    </Badge>
  );
}

function SummaryAvatar({
  name,
  hasAvatar,
  updatedAt,
}: {
  name: string;
  hasAvatar: boolean;
  updatedAt?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const frame = 'h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-[#D99A00]/50 ring-offset-2 ring-offset-[#FFF4D6] md:h-[72px] md:w-[72px]';

  useEffect(() => {
    if (!hasAvatar) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    fetchBlob('/customers/me/avatar')
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [hasAvatar, updatedAt]);

  if (src) {
    return <img src={src} alt="" className={frame} />;
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

  return (
    <div className={`flex items-center justify-center bg-white text-base font-bold text-[#D99A00] ${frame}`}>
      {initials || '؟'}
    </div>
  );
}
