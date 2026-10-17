'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { staffPickupsApi } from '@/lib/internal-api';
import { ApiClientError } from '@/lib/api';
import { PageHeader } from '@/components/dashboard/page-header';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { StatusBadge } from '@/components/portal/status-badge';
import {
  PickupStatusStepper,
  pickupStepTimestamps,
} from '@/components/portal/pickups/pickup-status-stepper';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { MobileNumber } from '@/components/ui/mobile-input';
import { DatePickerJalali } from '@/components/ui/date-picker-jalali';
import { pickupCancelActorName } from '@/lib/pickup-cancel-label';
import {
  formatDate,
  formatDateTime,
  formatWeight,
  PICKUP_STATUS_LABELS,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';

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

  const [staffNote, setStaffNote] = useState('');
  const [scheduledPickupAt, setScheduledPickupAt] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!canRead) return <ForbiddenNotice permission="pickup.read" />;
  if (detail.error) return <ApiErrorState error={detail.error} onRetry={() => void detail.mutate()} />;
  if (!detail.data) {
    return (
      <div className="space-y-4">
        <PageHeader title="جزئیات تحویل حضوری" />
        <p className="text-sm text-muted-foreground">در حال بارگذاری…</p>
      </div>
    );
  }

  const pickup = detail.data;
  const purityMillis = Math.round(Number(pickup.purityRatio) * 1000);
  const customerName = pickup.customer
    ? `${pickup.customer.firstName} ${pickup.customer.lastName}`.trim()
    : null;

  async function run(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setActionError(null);
    setFeedback(null);
    try {
      await action();
      setFeedback(successMessage);
      await detail.mutate();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'عملیات ناموفق بود.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={toPersianDigits(pickup.pickupNumber)}
        description="آماده‌سازی قالب آبشده و ثبت تحویل در فروشگاه"
        actions={
          <Link href="/dashboard/pickups" className="text-sm text-muted-foreground hover:text-foreground">
            بازگشت به صف
          </Link>
        }
      />

      <Card>
        <CardContent className="space-y-4 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusBadge
              status={pickup.status}
              label={statusLabel(PICKUP_STATUS_LABELS, pickup.status)}
            />
            <span className="text-xl font-bold tabular-nums">{formatWeight(pickup.weightGrams)}</span>
          </div>
          <PickupStatusStepper status={pickup.status} stepAt={pickupStepTimestamps(pickup)} />
          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div className="col-span-2">
              <dt className="text-muted-foreground">مشتری</dt>
              <dd className="space-y-0.5 font-medium">
                {customerName ? (
                  <>
                    <Link
                      href={`/dashboard/customers/${pickup.customerId}`}
                      className="text-gold-800 hover:underline"
                    >
                      {customerName}
                    </Link>
                    {pickup.customer?.customerNumber ? (
                      <p className="text-xs font-normal text-muted-foreground" dir="ltr">
                        {toPersianDigits(pickup.customer.customerNumber)}
                      </p>
                    ) : null}
                    {pickup.customer?.mobile ? (
                      <p className="text-xs font-normal text-muted-foreground">
                        <MobileNumber value={pickup.customer.mobile} />
                      </p>
                    ) : null}
                  </>
                ) : (
                  <Link
                    href={`/dashboard/customers/${pickup.customerId}`}
                    className="text-gold-800 hover:underline"
                  >
                    پرونده مشتری
                  </Link>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">عیار</dt>
              <dd>{toPersianDigits(String(purityMillis))}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ثبت</dt>
              <dd>{formatDateTime(pickup.requestedAt)}</dd>
            </div>
            {pickup.scheduledPickupAt ? (
              <div>
                <dt className="text-muted-foreground">زمان تحویل برنامه‌ریزی‌شده</dt>
                <dd className="font-medium">{formatDate(pickup.scheduledPickupAt)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-muted-foreground">آخرین به‌روزرسانی</dt>
              <dd>{formatDateTime(pickup.updatedAt)}</dd>
            </div>
          </dl>
          {pickup.customerNote ? (
            <p className="rounded-lg bg-muted/50 p-3 text-sm leading-7">
              یادداشت مشتری: {pickup.customerNote}
            </p>
          ) : null}
          {pickup.staffNote ? (
            <p className="rounded-lg bg-muted/50 p-3 text-sm leading-7">
              یادداشت کارمند: {pickup.staffNote}
            </p>
          ) : null}
          {pickup.status === 'CANCELLED' ? (
            <Alert variant="error">
              <p className="font-medium">
                لغوکننده: {pickupCancelActorName(pickup.cancelledByKind, 'staff')}
                {pickup.cancelledAt ? ` — ${formatDateTime(pickup.cancelledAt)}` : ''}
              </p>
              {pickup.cancelReason ? <p className="mt-1">دلیل: {pickup.cancelReason}</p> : null}
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">زمان‌بندی</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {pickup.events.map((event) => (
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

      {pickup.status !== 'DELIVERED' && pickup.status !== 'CANCELLED' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">اقدامات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canPrepare && pickup.status === 'REQUESTED' ? (
              <DatePickerJalali
                label="تاریخ تحویل حضوری"
                value={scheduledPickupAt}
                onChange={setScheduledPickupAt}
                allowFuture
                required
                hint="هنگام شروع آماده‌سازی، تاریخ مراجعه مشتری به فروشگاه را انتخاب کنید."
              />
            ) : null}
            <Input
              id="staff-note"
              label="یادداشت کارمند (اختیاری)"
              value={staffNote}
              onChange={(e) => setStaffNote(e.target.value)}
              maxLength={1000}
            />
            <div className="flex flex-wrap gap-2">
              {canPrepare && pickup.status === 'REQUESTED' ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (!scheduledPickupAt) {
                      setActionError('تاریخ تحویل را از تقویم انتخاب کنید.');
                      setFeedback(null);
                      return;
                    }
                    void run(
                      () =>
                        staffPickupsApi.markPreparing(pickup.id, {
                          scheduledPickupAt,
                          staffNote: staffNote || undefined,
                        }),
                      'آماده‌سازی شروع شد.',
                    );
                  }}
                >
                  شروع آماده‌سازی
                </Button>
              ) : null}
              {canPrepare && pickup.status === 'PREPARING' ? (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => staffPickupsApi.markReady(pickup.id, staffNote || undefined),
                      'آماده تحویل شد.',
                    )
                  }
                >
                  اعلام آماده تحویل
                </Button>
              ) : null}
              {canDeliver && pickup.status === 'READY' ? (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => staffPickupsApi.deliver(pickup.id, staffNote || undefined),
                      'تحویل ثبت شد.',
                    )
                  }
                >
                  ثبت تحویل در فروشگاه
                </Button>
              ) : null}
            </div>

            {canCancel ? (
              <div className="space-y-2 border-t pt-4">
                <Input
                  id="cancel-reason"
                  label="لغو توسط کارمند"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="دلیل لغو"
                  maxLength={500}
                />
                <Button
                  variant="outline"
                  disabled={busy || !cancelReason.trim()}
                  onClick={() =>
                    void run(
                      () => staffPickupsApi.cancel(pickup.id, cancelReason.trim()),
                      'درخواست لغو شد.',
                    )
                  }
                >
                  لغو درخواست
                </Button>
              </div>
            ) : null}

            {feedback ? <Alert variant="success">{feedback}</Alert> : null}
            {actionError ? <Alert variant="error">{actionError}</Alert> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
