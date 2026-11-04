'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { PickupPrintVoucher } from '@/components/portal/pickups/PickupPrintVoucher';
import { CalendarDays } from 'lucide-react';
import { pickupsApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageSpinner } from '@/components/ui/spinner';
import { Alert } from '@/components/ui/alert';
import { Toast } from '@/components/dashboard/customer-widgets';
import { PickupDetailHeader } from '@/components/pickups/pickup-detail-header';
import {
  PickupDeliveryProgress,
  PickupAuditLog,
  PickupFinance,
  PickupVerification,
  PickupCancelAction,
} from '@/components/pickups/pickup-detail-view-cards';
import { CANCEL_PICKUP_SUCCESS } from '@/components/pickups/CancelPickupModal';
import { pickupCancelActorName } from '@/lib/pickup-cancel-label';
import { usePrintPageSize } from '@/lib/print';
import { formatDate } from '@/lib/utils';

export default function PortalPickupDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR(
    params.id ? ['portal-pickup', params.id] : null,
    () => pickupsApi.getById(params.id),
  );
  const [cancelToast, setCancelToast] = useState<string | null>(null);
  const canCancel = data?.status === 'REQUESTED';
  usePrintPageSize('A5 landscape');

  if (isLoading && !data) return <PageSpinner />;
  if (error) return <Alert variant="error">درخواست پیدا نشد یا قابل دریافت نیست.</Alert>;
  if (!data) return null;

  return (
    <div
      dir="rtl"
      className="print-doc mx-auto max-w-7xl space-y-6 rounded-2xl bg-slate-50/80 p-3 sm:p-6"
    >
      <Toast message={cancelToast} onClose={() => setCancelToast(null)} />
      <PickupDetailHeader pickup={data} backHref="/portal/pickups" />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-6 pt-6 pb-2">
              <CardTitle className="text-base">مدیریت تحویل</CardTitle>
              <CalendarDays className="h-5 w-5 text-gold-600" aria-hidden />
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-0">
              <PickupDeliveryProgress pickup={data} />
              {data.scheduledPickupAt ? (
                <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  زمان تحویل برنامه‌ریزی‌شده:{' '}
                  <span className="font-medium text-slate-900">
                    {formatDate(data.scheduledPickupAt)}
                  </span>
                </p>
              ) : null}
              {data.status === 'READY' ? (
                <Alert variant="success" className="mt-4">
                  درخواست شما آماده است. با مراجعه به فروشگاه می‌توانید قالب آبشده را تحویل بگیرید.
                </Alert>
              ) : null}
              {data.status === 'CANCELLED' ? (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-7 text-red-700">
                  <p className="font-medium">
                    لغو کننده: {pickupCancelActorName(data.cancelledByKind, 'portal')}
                    {data.cancelledAt ? (
                      <span className="font-normal">
                        {' '}
                        - تاریخ لغو: {formatDate(data.cancelledAt)}
                      </span>
                    ) : null}
                  </p>
                  {data.cancelReason ? (
                    <p className="mt-1 break-words">دلیل لغو: {data.cancelReason}</p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <PickupAuditLog pickup={data} showActors={false} />
          {data.customerNote ? (
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">یادداشت شما</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">
                  {data.customerNote}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-4" aria-label="رسید و تأیید تحویل">
          <PickupFinance
            pickup={data}
            onPrint={() => window.print()}
            downloadPreInvoice={() => pickupsApi.downloadPreInvoice(data.id)}
            downloadInvoice={() => pickupsApi.downloadInvoice(data.id)}
          />
          <PickupVerification pickup={data} audience="customer" />
          <PickupCancelAction
            pickup={data}
            canCancel={canCancel}
            audience="customer"
            onCancelled={() => {
              setCancelToast(CANCEL_PICKUP_SUCCESS);
              void mutate().catch(() => undefined);
              router.refresh();
            }}
          />
        </aside>
      </div>
      <PickupPrintVoucher pickup={data} />
    </div>
  );
}
