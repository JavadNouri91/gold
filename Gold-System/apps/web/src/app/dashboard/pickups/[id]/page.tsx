'use client';

import { useState } from 'react';
import { Toast } from '@/components/dashboard/customer-widgets';
import { CANCEL_PICKUP_SUCCESS } from '@/components/pickups/CancelPickupModal';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { CalendarDays } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { staffPickupsApi } from '@/lib/internal-api';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState, SkeletonBlock } from '@/components/dashboard/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PickupDetailHeader } from '@/components/pickups/pickup-detail-header';
import { PickupActionPanel } from '@/components/pickups/pickup-action-panel';
import { PickupCancelledCard, PickupNotesCard } from '@/components/pickups/pickup-cards';
import { usePrintPageSize } from '@/lib/print';
import {
  PickupDeliveryProgress,
  PickupCancelAction,
  PickupFinance,
  PickupVerification,
  PickupAuditLog,
} from '@/components/pickups/pickup-detail-view-cards';
import { formatDate } from '@/lib/utils';

export default function StaffPickupDetailPage() {
  const [cancelToast, setCancelToast] = useState<string | null>(null);
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const canRead = hasPermission(user?.permissions, 'pickup.read');
  const canPrepare = hasPermission(user?.permissions, 'pickup.prepare');
  const canDeliver = hasPermission(user?.permissions, 'pickup.deliver');
  const canCancel = hasPermission(user?.permissions, 'pickup.cancel');

  const detail = useSWR(canRead && params.id ? ['staff-pickup', params.id] : null, () =>
    staffPickupsApi.getById(params.id),
  );

  usePrintPageSize('A5 portrait');

  if (!canRead) return <ForbiddenNotice permission="pickup.read" />;
  if (detail.error)
    return <ApiErrorState error={detail.error} onRetry={() => void detail.mutate()} />;

  const pickup = detail.data;
  const hasActionSlot = pickup ? pickup.status !== 'CANCELLED' : false;

  return (
    <div dir="rtl" className="print-doc space-y-6 rounded-2xl bg-slate-50/80 p-3 sm:p-6">
      <Toast message={cancelToast} onClose={() => setCancelToast(null)} />
      {pickup ? <PickupDetailHeader pickup={pickup} /> : <SkeletonBlock className="h-20" />}

      {!pickup ? (
        <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری">
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-40" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-6">
              <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 px-6 pt-6 pb-2">
                  <CardTitle className="text-base">مدیریت تحویل</CardTitle>
                  <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <PickupDeliveryProgress pickup={pickup} />
                  {pickup.scheduledPickupAt ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                      زمان تحویل برنامه‌ریزی‌شده:{' '}
                      <span className="font-medium text-foreground">
                        {formatDate(pickup.scheduledPickupAt)}
                      </span>
                    </p>
                  ) : null}
                </CardContent>
                {hasActionSlot ? (
                  <div className="print-screen-only">
                    <PickupActionPanel
                      pickup={pickup}
                      canPrepare={canPrepare}
                      canDeliver={canDeliver}
                      canCancel={false}
                      embedded
                      onChanged={() => void detail.mutate()}
                    />
                  </div>
                ) : null}
              </Card>

              <PickupAuditLog pickup={pickup} />
              <PickupNotesCard pickup={pickup} />
            </div>
            <aside className="min-w-0 space-y-4">
              <PickupFinance pickup={pickup} />
              <PickupVerification pickup={pickup} />
              <PickupCancelAction
                pickup={pickup}
                canCancel={canCancel}
                onCancelled={() => setCancelToast(CANCEL_PICKUP_SUCCESS)}
              />
            </aside>
          </div>

          <PickupCancelledCard pickup={pickup} />
        </>
      )}
    </div>
  );
}
