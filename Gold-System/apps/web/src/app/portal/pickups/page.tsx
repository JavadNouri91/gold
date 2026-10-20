'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ordersApi, pickupsApi, type PhysicalGoldPickupStatus } from '@/lib/api';
import { toPortfolioPosition, isRegisteredHolding } from '@/lib/customer-portfolio';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/spinner';
import { Alert, EmptyState } from '@/components/ui/alert';
import { StatusBadge } from '@/components/portal/status-badge';
import { NewPickupModal } from '@/components/portal/pickups/new-pickup-modal';
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

/** List-view badge copy — in-progress statuses collapse to «در حال پردازش». */
function pickupListStatusLabel(status: PhysicalGoldPickupStatus): string {
  if (status === 'REQUESTED' || status === 'PREPARING') return 'در حال پردازش';
  if (status === 'DELIVERED') return 'تحویل شده';
  return statusLabel(PICKUP_STATUS_LABELS, status);
}

export default function PortalPickupsPage() {
  const [newOpen, setNewOpen] = useState(false);
  const { data, error, isLoading } = useSWR('portal-pickups', () =>
    pickupsApi.list({ limit: 50 }),
  );
  const { data: holding } = useSWR('orders/portfolio', () => ordersApi.portfolio());
  const position = toPortfolioPosition(holding);
  const available = isRegisteredHolding(position) ? position : null;
  const reservedGrams = holding?.reservedPickupGrams ?? '0';

  if (isLoading && !data) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">تحویل حضوری</h1>
        <Button type="button" onClick={() => setNewOpen(true)}>
          + درخواست جدید
        </Button>
      </div>

      <p className="text-sm leading-7 text-muted-foreground">
        موجودی طلای آبشده خود را به‌صورت قالب در فروشگاه تحویل بگیرید. با ثبت درخواست، وزن از موجودی شما
        رزرو می‌شود.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="rounded-xl border-gray-100 shadow-sm">
          <CardContent className="space-y-1 py-4">
            <p className="text-xs text-muted-foreground">موجودی طلای قابل درخواست</p>
            <p className="text-xl font-bold tabular-nums">
              {available ? formatWeight(available.weightGrams) : '۰ گرم'}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-amber-100 bg-amber-50 shadow-sm">
          <CardContent className="space-y-1 py-4">
            <p className="text-xs text-amber-800/80">طلای در انتظار تحویل</p>
            <p className="text-xl font-bold tabular-nums text-amber-950">
              {formatWeight(reservedGrams)}
            </p>
          </CardContent>
        </Card>
      </div>

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
              <Card className="cursor-pointer rounded-xl border-gray-100 shadow-sm transition-shadow hover:shadow-md">
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium" dir="ltr">
                        {toPersianDigits(pickup.pickupNumber)}
                      </p>
                      <p className="text-sm text-foreground">
                        درخواست {formatWeight(pickup.weightGrams)} طلای آبشده
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(pickup.requestedAt)}</p>
                    </div>
                    <StatusBadge
                      status={pickup.status}
                      label={pickupListStatusLabel(pickup.status)}
                    />
                  </div>

                  <PickupStatusStepper
                    status={pickup.status}
                    stepAt={pickupStepTimestamps(pickup)}
                    compact
                  />

                  {pickup.status === 'CANCELLED' ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-6 text-red-700">
                      <p className="font-medium">
                        لغو کننده: {pickupCancelActorName(pickup.cancelledByKind, 'portal')}
                        {pickup.cancelledAt ? (
                          <span className="font-normal">
                            {' '}
                            - تاریخ لغو: {formatDate(pickup.cancelledAt)}
                          </span>
                        ) : null}
                      </p>
                      {pickup.cancelReason ? (
                        <p className="mt-0.5">دلیل لغو: {pickup.cancelReason}</p>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <NewPickupModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
