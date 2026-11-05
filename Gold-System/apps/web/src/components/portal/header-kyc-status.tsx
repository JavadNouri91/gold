'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { customerApi, kycApi } from '@/lib/api';
import { HeaderHoverTip } from '@/components/portal/header-hover-tip';
import { cn } from '@/lib/utils';

/** KYC cue shown to the right of توان خرید in RTL. */
export function HeaderKycStatus({ className }: { className?: string }) {
  const { data: customer } = useSWR('customer/me', () => customerApi.getMe());
  const { data: kyc } = useSWR(customer?.status ? 'kyc/me' : null, () => kycApi.getMine());
  if (!customer?.status) return null;

  // Wait for document state before prompting: customer PENDING also covers submitted files.
  const verified = kyc
    ? kyc.phase === 'VERIFIED'
    : customer.status === 'APPROVED' || customer.status === 'ACTIVE';
  if (!kyc && !verified) return null;
  const rejected = kyc?.phase === 'REJECTED' || kyc?.phase === 'NEEDS_CORRECTION';
  const pending =
    !rejected &&
    (kyc?.phase === 'SUBMITTED' ||
      kyc?.phase === 'UNDER_REVIEW' ||
      kyc?.documents.some((document) => document.file !== null));
  const label = verified
    ? 'احراز هویت تأیید شده'
    : rejected
      ? 'مدارک رد شده؛ نیاز به اصلاح'
      : pending
        ? 'مدارک شما در انتظار تأیید است'
        : 'مدارک احراز هویت را ارسال کنید';
  const hint = verified ? 'هویت شما تأیید شده و می‌توانید معامله کنید.' : label;

  return (
    <HeaderHoverTip content={hint} tone={verified ? 'emerald' : 'amber'}>
      <Link
        href="/portal/profile#kyc"
        aria-label={label}
        className={cn(
          'inline-flex h-11 shrink-0 items-center justify-center rounded-xl ring-1 sm:h-12',
          verified
            ? 'w-11 bg-emerald-50 text-emerald-700 ring-emerald-100 hover:bg-emerald-100 sm:w-12'
            : cn(
                'gap-1 px-1.5 text-[11px] font-medium sm:gap-2 sm:px-3 sm:text-xs',
                pending
                  ? 'bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100'
                  : 'bg-red-50 text-red-700 ring-red-200 hover:bg-red-100',
              ),
          className,
        )}
      >
        {verified ? (
          <ShieldCheck className="h-5 w-5" aria-hidden data-testid="kyc-verified-icon" />
        ) : (
          <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden data-testid="kyc-warning-icon" />
        )}
        {!verified && (
          <span className="max-w-[3.5rem] text-right leading-[14px] min-[400px]:max-w-[6.5rem] sm:max-w-none sm:leading-5">
            {label}
          </span>
        )}
      </Link>
    </HeaderHoverTip>
  );
}
