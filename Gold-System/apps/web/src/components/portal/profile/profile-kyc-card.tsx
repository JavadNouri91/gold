'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, ShieldX } from 'lucide-react';
import { resolveKycUiStatus, type KycUiStatus } from '@/components/portal/kyc-status-card';
import { cn } from '@/lib/utils';

const COPY: Record<
  KycUiStatus,
  { title: string; body: string; icon: typeof CheckCircle2; className: string }
> = {
  approved: {
    title: 'احراز هویت شما تأیید شده است.',
    body: 'اکنون می‌توانید به‌صورت کامل از سامانه استفاده کنید.',
    icon: CheckCircle2,
    className: 'border-emerald-100 bg-emerald-50 text-emerald-800',
  },
  review: {
    title: 'احراز هویت در حال بررسی است.',
    body: 'پس از تأیید مدارک، امکان استفاده کامل از سامانه فعال می‌شود.',
    icon: Clock,
    className: 'border-amber-100 bg-amber-50 text-amber-900',
  },
  revision: {
    title: 'احراز هویت نیازمند اصلاح است.',
    body: 'لطفاً مدارک ردشده را بررسی و دوباره ارسال کنید.',
    icon: AlertTriangle,
    className: 'border-orange-100 bg-orange-50 text-orange-900',
  },
  unverified: {
    title: 'احراز هویت شما تأیید نشده است.',
    body: 'برای استفاده کامل از سامانه، مدارک هویتی خود را ارسال کنید.',
    icon: ShieldX,
    className: 'border-slate-200 bg-slate-50 text-slate-700',
  },
};

export function ProfileKycCard({ customerStatus }: { customerStatus?: string }) {
  const status = resolveKycUiStatus({ customerStatus });
  const copy = COPY[status];
  const Icon = copy.icon;

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-slate-800">وضعیت احراز هویت</h2>
      <div className={cn('mt-4 rounded-xl border p-4', copy.className)}>
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-bold">{copy.title}</p>
            <p className="mt-1 text-xs leading-6 opacity-90">{copy.body}</p>
          </div>
        </div>
      </div>
      <Link
        href="/portal/kyc"
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-gold-200 bg-gold-50 text-sm font-semibold text-gold-800 hover:bg-gold-100"
      >
        مشاهده جزئیات
      </Link>
    </section>
  );
}
