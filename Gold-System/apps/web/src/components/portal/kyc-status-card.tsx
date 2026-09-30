'use client';

import Link from 'next/link';
import { CheckCircle2, Clock, AlertTriangle, ShieldX } from 'lucide-react';
import { cn } from '@/lib/utils';

export type KycUiStatus = 'approved' | 'review' | 'revision' | 'unverified';

const COPY: Record<
  KycUiStatus,
  { title: string; body: string; icon: typeof CheckCircle2; className: string }
> = {
  approved: {
    title: 'احراز هویت شما تأیید شده است.',
    body: 'اکنون می‌توانید به‌صورت کامل معامله کنید.',
    icon: CheckCircle2,
    className: 'border-emerald-100 bg-emerald-50/80 text-emerald-800',
  },
  review: {
    title: 'احراز هویت در حال بررسی است.',
    body: 'پس از تأیید مدارک، امکان معامله کامل فعال می‌شود.',
    icon: Clock,
    className: 'border-amber-100 bg-amber-50/80 text-amber-900',
  },
  revision: {
    title: 'احراز هویت نیازمند اصلاح است.',
    body: 'لطفاً مدارک ردشده را بررسی و دوباره ارسال کنید.',
    icon: AlertTriangle,
    className: 'border-orange-100 bg-orange-50/80 text-orange-900',
  },
  unverified: {
    title: 'احراز هویت شما تأیید نشده است.',
    body: 'برای معامله کامل، مدارک هویتی خود را ارسال کنید.',
    icon: ShieldX,
    className: 'border-slate-200 bg-slate-50 text-slate-700',
  },
};

export function resolveKycUiStatus(input: {
  customerStatus?: string;
  kycStatus?: string;
}): KycUiStatus {
  const kyc = input.kycStatus;
  const customer = input.customerStatus;
  if (kyc === 'REJECTED' || customer === 'REJECTED') return 'revision';
  if (kyc === 'APPROVED' || customer === 'APPROVED' || customer === 'ACTIVE') return 'approved';
  if (kyc === 'UNDER_REVIEW' || kyc === 'PENDING' || customer === 'UNDER_REVIEW') return 'review';
  return 'unverified';
}

export function KycStatusCard({
  customerStatus,
  kycStatus,
}: {
  customerStatus?: string;
  kycStatus?: string;
}) {
  const status = resolveKycUiStatus({ customerStatus, kycStatus });
  const copy = COPY[status];
  const Icon = copy.icon;

  return (
    <Link
      href="/portal/kyc"
      className={cn('block rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md', copy.className)}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-6 w-6 shrink-0" />
        <div>
          <p className="text-sm font-bold">{copy.title}</p>
          <p className="mt-1 text-xs opacity-80">{copy.body}</p>
        </div>
      </div>
    </Link>
  );
}
