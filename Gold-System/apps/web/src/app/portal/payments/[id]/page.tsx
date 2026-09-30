'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { ApiClientError, paymentsApi } from '@/lib/api';
import { PaymentDetailView } from '@/components/portal/payments/payment-detail-view';

export default function PaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, error, isLoading, mutate } = useSWR(params.id ? ['payments', params.id] : null, () =>
    paymentsApi.getById(params.id),
  );

  if (isLoading && !data) {
    return (
      <div className="space-y-3" aria-hidden>
        <div className="h-8 w-40 animate-pulse rounded-xl bg-white" />
        <div className="h-64 animate-pulse rounded-2xl bg-white" />
      </div>
    );
  }

  if (error) {
    const missing = error instanceof ApiClientError && error.isNotFound;
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center" role="alert">
        <p className="text-sm font-semibold text-[#DC2626]">
          {missing ? 'این پرداخت پیدا نشد.' : 'پرداخت‌ها قابل دریافت نیست.'}
        </p>
        {missing ? null : (
          <button
            type="button"
            onClick={() => void mutate()}
            className="mt-3 min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-[#202124]"
          >
            تلاش مجدد
          </button>
        )}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-8 text-center">
        <p className="text-sm text-[#202124]">این پرداخت پیدا نشد.</p>
      </div>
    );
  }

  return <PaymentDetailView payment={data} />;
}
