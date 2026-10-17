'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { customerApi } from '@/lib/api';
import { resolveKycUiStatus } from '@/components/portal/kyc-status-card';
import { HeaderHoverTip } from '@/components/portal/header-hover-tip';
import { cn } from '@/lib/utils';

/** KYC cue shown to the right of توان خرید in RTL. */
export function HeaderKycStatus({ className }: { className?: string }) {
  const { data: customer } = useSWR('customer/me', () => customerApi.getMe());
  if (!customer?.status) return null;

  const verified = resolveKycUiStatus({ customerStatus: customer.status }) === 'approved';
  const label = verified ? 'احراز هویت تأیید شده' : 'هشدار احراز هویت نشده';
  const hint = verified
    ? 'هویت شما تأیید شده و می‌توانید معامله کنید.'
    : 'احراز هویت نشده است. برای معامله مدارک را ارسال کنید.';

  return (
    <HeaderHoverTip content={hint} tone={verified ? 'emerald' : 'amber'}>
      <Link
        href="/portal/kyc"
        aria-label={label}
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 sm:h-12 sm:w-12',
          verified
            ? 'bg-emerald-50 text-emerald-700 ring-emerald-100 hover:bg-emerald-100'
            : 'bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100',
          className,
        )}
      >
        {verified ? (
          <ShieldCheck className="h-5 w-5" aria-hidden data-testid="kyc-verified-icon" />
        ) : (
          <AlertTriangle className="h-5 w-5" aria-hidden data-testid="kyc-warning-icon" />
        )}
      </Link>
    </HeaderHoverTip>
  );
}
