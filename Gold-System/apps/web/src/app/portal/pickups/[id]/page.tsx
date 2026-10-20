'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { pickupsApi, ApiClientError } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSpinner } from '@/components/ui/spinner';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from '@/components/portal/status-badge';
import {
  PickupStatusStepper,
  pickupStepTimestamps,
} from '@/components/portal/pickups/pickup-status-stepper';
import { pickupCancelActorName } from '@/lib/pickup-cancel-label';
import {
  formatDate,
  formatDateTime,
  formatWeight,
  PICKUP_STATUS_LABELS,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';

export default function PortalPickupDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR(
    params.id ? ['portal-pickup', params.id] : null,
    () => pickupsApi.getById(params.id),
  );
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const canCancel = data?.status === 'REQUESTED';

  async function onCancel() {
    if (!data || !reason.trim()) {
      setCancelError('دلیل لغو را وارد کنید.');
      return;
    }
    setCancelling(true);
    setCancelError(null);
    try {
      await pickupsApi.cancel(data.id, reason.trim());
      await mutate();
      router.refresh();
    } catch (err) {
      setCancelError(err instanceof ApiClientError ? err.message : 'لغو ناموفق بود.');
    } finally {
      setCancelling(false);
    }
  }

  if (isLoading && !data) return <PageSpinner />;
  if (error) return <Alert variant="error">درخواست پیدا نشد یا قابل دریافت نیست.</Alert>;
  if (!data) return null;

  const purityMillis = Math.round(Number(data.purityRatio) * 1000);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">درخواست تحویل حضوری</p>
          <h1 className="text-2xl font-bold" dir="ltr">
            {toPersianDigits(data.pickupNumber)}
          </h1>
        </div>
        <Link href="/portal/pickups" className="text-sm text-muted-foreground hover:text-foreground">
          بازگشت به فهرست
        </Link>
      </div>

      <Card>
        <CardContent className="space-y-4 py-6">
          <div className="flex items-center justify-between gap-3">
            <StatusBadge status={data.status} label={statusLabel(PICKUP_STATUS_LABELS, data.status)} />
            <span className="text-lg font-bold tabular-nums">{formatWeight(data.weightGrams)}</span>
          </div>
          <PickupStatusStepper status={data.status} stepAt={pickupStepTimestamps(data)} />
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">عیار</dt>
              <dd className="font-medium">{toPersianDigits(String(purityMillis))}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ثبت</dt>
              <dd>{formatDateTime(data.requestedAt)}</dd>
            </div>
            {data.scheduledPickupAt ? (
              <div>
                <dt className="text-muted-foreground">زمان تحویل برنامه‌ریزی‌شده</dt>
                <dd className="font-medium">{formatDate(data.scheduledPickupAt)}</dd>
              </div>
            ) : null}
            {data.readyAt ? (
              <div>
                <dt className="text-muted-foreground">آماده تحویل</dt>
                <dd>{formatDateTime(data.readyAt)}</dd>
              </div>
            ) : null}
            {data.deliveredAt ? (
              <div>
                <dt className="text-muted-foreground">تحویل</dt>
                <dd>{formatDateTime(data.deliveredAt)}</dd>
              </div>
            ) : null}
          </dl>
          {data.customerNote ? (
            <p className="rounded-lg bg-slate-50 p-3 text-sm leading-7">{data.customerNote}</p>
          ) : null}
          {data.status === 'CANCELLED' ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-7 text-red-700">
              <p className="font-medium">
                لغو کننده: {pickupCancelActorName(data.cancelledByKind, 'portal')}
                {data.cancelledAt ? (
                  <span className="font-normal"> - تاریخ لغو: {formatDate(data.cancelledAt)}</span>
                ) : null}
              </p>
              {data.cancelReason ? <p className="mt-1">دلیل لغو: {data.cancelReason}</p> : null}
            </div>
          ) : null}
          {data.status === 'READY' ? (
            <Alert variant="success">
              درخواست شما آماده است. با مراجعه به فروشگاه می‌توانید قالب آبشده را تحویل بگیرید.
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">زمان‌بندی مراحل</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {data.events.map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{statusLabel(PICKUP_STATUS_LABELS, event.status)}</p>
                  {event.note ? <p className="text-muted-foreground">{event.note}</p> : null}
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(event.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {canCancel ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">لغو درخواست</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-7 text-muted-foreground">
              با لغو، وزن رزرو شده به موجودی قابل‌فروش شما برمی‌گردد.
            </p>
            <Input
              id="cancel-reason"
              label="دلیل لغو"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              required
            />
            {cancelError ? <Alert variant="error">{cancelError}</Alert> : null}
            <Button variant="outline" onClick={() => void onCancel()} disabled={cancelling}>
              {cancelling ? 'در حال لغو…' : 'لغو درخواست'}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
