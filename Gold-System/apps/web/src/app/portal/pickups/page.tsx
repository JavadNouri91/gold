'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { pickupsApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/spinner';
import { Alert, EmptyState } from '@/components/ui/alert';
import { StatusBadge } from '@/components/portal/status-badge';
import {
  PickupStatusStepper,
  pickupStepTimestamps,
} from '@/components/portal/pickups/pickup-status-stepper';
import { pickupCancelActorName } from '@/lib/pickup-cancel-label';
import {
  formatDate,
  formatWeight,
  PICKUP_STATUS_LABELS,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';

export default function PortalPickupsPage() {
  const { data, error, isLoading } = useSWR('portal-pickups', () =>
    pickupsApi.list({ limit: 50 }),
  );

  if (isLoading && !data) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">تحویل حضوری</h1>
        <Link href="/portal/pickups/new">
          <Button>+ درخواست جدید</Button>
        </Link>
      </div>

      <p className="text-sm leading-7 text-muted-foreground">
        موجودی طلای آبشده خود را به‌صورت قالب در فروشگاه تحویل بگیرید. با ثبت درخواست، وزن از موجودی شما
        رزرو می‌شود.
      </p>

      {error ? <Alert variant="error">خطا در بارگذاری درخواست‌ها</Alert> : null}

      {!error && data?.data?.length === 0 ? (
        <EmptyState
          icon="📦"
          message="هنوز درخواست تحویل حضوری ندارید"
          description="از موجودی طلای آبشده خود درخواست تحویل ثبت کنید"
        />
      ) : (
        <div className="space-y-3">
          {data?.data?.map((pickup) => (
            <Link key={pickup.id} href={`/portal/pickups/${pickup.id}`}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium" dir="ltr">
                        {toPersianDigits(pickup.pickupNumber)}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(pickup.requestedAt)}</p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="tabular-nums">{formatWeight(pickup.weightGrams)}</span>
                      <StatusBadge
                        status={pickup.status}
                        label={statusLabel(PICKUP_STATUS_LABELS, pickup.status)}
                      />
                    </div>
                  </div>
                  {pickup.status === 'CANCELLED' ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-6 text-red-800">
                      <p className="font-medium">
                        لغوکننده: {pickupCancelActorName(pickup.cancelledByKind, 'portal')}
                        {pickup.cancelledAt ? (
                          <span className="font-normal text-red-700">
                            {' '}
                            — {formatDate(pickup.cancelledAt)}
                          </span>
                        ) : null}
                      </p>
                      {pickup.cancelReason ? (
                        <p className="mt-0.5 text-red-700">دلیل: {pickup.cancelReason}</p>
                      ) : null}
                    </div>
                  ) : (
                    <PickupStatusStepper
                      status={pickup.status}
                      stepAt={pickupStepTimestamps(pickup)}
                      compact
                    />
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
