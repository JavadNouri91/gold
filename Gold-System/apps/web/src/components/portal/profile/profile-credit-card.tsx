'use client';

import Link from 'next/link';
import { ArrowLeftRight } from 'lucide-react';
import type { CustomerAccount } from '@/lib/api';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { formatRial } from '@/lib/utils';

export function ProfileCreditCard({
  account,
  isLoading,
  hasError,
  unavailable,
}: {
  account?: CustomerAccount;
  isLoading?: boolean;
  hasError?: boolean;
  unavailable?: boolean;
}) {
  const used = account
    ? Number(account.reservedCreditRial || 0) + Number(account.consumedCreditRial || 0)
    : 0;

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-800">اعتبار معاملاتی</h2>
        <ArrowLeftRight className="h-4 w-4 text-gold-600" aria-hidden />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : unavailable ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-3 py-4 text-sm text-muted-foreground">
          حساب اعتباری پس از تأیید احراز هویت فعال می‌شود.
        </p>
      ) : hasError || !account ? (
        <Alert variant="error" className="mt-4">
          اطلاعات اعتبار بارگذاری نشد
        </Alert>
      ) : (
        <>
          <p className="mt-4 text-xs text-muted-foreground">اعتبار فعلی</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900 md:text-xl">
            {formatRial(account.availableCreditRial)}
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <CreditRow label="اعتبار کل" value={formatRial(account.creditLimitRial)} />
            <CreditRow label="اعتبار استفاده‌شده" value={formatRial(String(used))} />
          </dl>
        </>
      )}

      <Link
        href="/portal/credit"
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl text-sm font-semibold text-gold-800 hover:bg-gold-50"
      >
        مشاهده جزئیات اعتبار
      </Link>
    </section>
  );
}

function CreditRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xs font-semibold tabular-nums text-slate-800">{value}</dd>
    </div>
  );
}
