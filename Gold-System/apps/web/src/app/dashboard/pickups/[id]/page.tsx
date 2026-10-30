'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { CalendarDays } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { staffPickupsApi } from '@/lib/internal-api';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState, SkeletonBlock } from '@/components/dashboard/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PickupStatusStepper,
  pickupStepTimestamps,
} from '@/components/portal/pickups/pickup-status-stepper';
import { PickupDetailHeader } from '@/components/pickups/pickup-detail-header';
import { PickupActionPanel } from '@/components/pickups/pickup-action-panel';
import {
  PickupCancelledCard,
  PickupFinancialCard,
  PickupGoldCard,
  PickupNotesCard,
  PickupSummaryCard,
} from '@/components/pickups/pickup-cards';
import { usePrintPageSize } from '@/lib/print';
import { cn, formatDate } from '@/lib/utils';

export default function StaffPickupDetailPage() {
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
  if (detail.error) return <ApiErrorState error={detail.error} onRetry={() => void detail.mutate()} />;

  const pickup = detail.data;
  // A cancelled pickup has no operational actions, so the row collapses to two
  // columns instead of leaving an empty action slot.
  const hasActionSlot = pickup ? pickup.status !== 'CANCELLED' : false;

  return (
    <div className="print-doc space-y-4">
      {pickup ? (
        <PickupDetailHeader
          pickup={pickup}
          downloadPreInvoice={() => staffPickupsApi.downloadPreInvoice(pickup.id)}
          downloadInvoice={() => staffPickupsApi.downloadInvoice(pickup.id)}
        />
      ) : (
        <SkeletonBlock className="h-20" />
      )}

      {!pickup ? (
        <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری">
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-40" />
        </div>
      ) : (
        <>
          <PickupSummaryCard pickup={pickup} />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
              <CardTitle className="text-base">مراحل تحویل</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <PickupStatusStepper status={pickup.status} stepAt={pickupStepTimestamps(pickup)} />
              {pickup.scheduledPickupAt ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  زمان تحویل برنامه‌ریزی‌شده:{' '}
                  <span className="font-medium text-foreground">
                    {formatDate(pickup.scheduledPickupAt)}
                  </span>
                </p>
              ) : null}
            </CardContent>
          </Card>

          <div
            className={cn(
              'print-doc-columns grid grid-cols-1 items-stretch gap-4',
              hasActionSlot ? 'lg:grid-cols-3' : 'lg:grid-cols-2',
            )}
          >
            {hasActionSlot ? (
              <div className="print-screen-only h-full">
                <PickupActionPanel
                  pickup={pickup}
                  canPrepare={canPrepare}
                  canDeliver={canDeliver}
                  canCancel={canCancel}
                  onChanged={() => void detail.mutate()}
                />
              </div>
            ) : null}
            <PickupGoldCard pickup={pickup} />
            <PickupFinancialCard pickup={pickup} />
          </div>

          <PickupCancelledCard pickup={pickup} />

          <PickupNotesCard pickup={pickup} />
        </>
      )}
    </div>
  );
}
