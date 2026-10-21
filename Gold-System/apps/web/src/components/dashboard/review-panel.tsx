'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from './confirm-dialog';
import { PermissionGate } from './permission-gate';
import { internalOrdersApi, internalTradesApi, type ReviewContext } from '@/lib/internal-api';
import { ApiClientError } from '@/lib/api';

export function ReviewContextPanel({
  context,
  onChanged,
}: {
  context: ReviewContext;
  onChanged: () => void;
}) {
  const [action, setAction] = useState<'approve' | 'reject' | 'revision' | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = context.order.status;
  const canDecide = status === 'QUOTED' || status === 'ASSIGNED' || status === 'UNDER_REVIEW';
  const canCreateTrade = status === 'APPROVED';

  const run = async (reason?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'approve') await internalOrdersApi.approve(context.order.id);
      if (action === 'reject') await internalOrdersApi.reject(context.order.id, reason ?? '');
      if (action === 'revision') await internalOrdersApi.requestRevision(context.order.id, reason ?? '');
      setFeedback('وضعیت سفارش از سرور به‌روزرسانی شد.');
      setAction(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'عملیات انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  const confirmTrade = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await internalTradesApi.confirm({ orderId: context.order.id });
      setFeedback('معامله از سفارش تأییدشده ایجاد شد.');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'ایجاد معامله انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold">اقدام سفارش</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PermissionGate anyOf="trade.request_revision">
              {canDecide ? (
                <Button variant="outline" className="h-10 min-w-[8.5rem]" disabled={busy} onClick={() => setAction('revision')}>
                  درخواست اصلاح
                </Button>
              ) : null}
            </PermissionGate>
            <PermissionGate anyOf="trade.reject">
              {canDecide ? (
                <Button variant="destructive" className="h-10 min-w-[8.5rem]" disabled={busy} onClick={() => setAction('reject')}>
                  رد سفارش
                </Button>
              ) : null}
            </PermissionGate>
            <PermissionGate anyOf="trade.approve">
              {canDecide ? (
                <Button className="h-10 min-w-[8.5rem]" disabled={busy} onClick={() => setAction('approve')}>
                  تأیید نهایی
                </Button>
              ) : null}
              {canCreateTrade ? (
                <Button className="h-10 min-w-[8.5rem]" disabled={busy} onClick={() => void confirmTrade()}>
                  تکمیل ایجاد معامله
                </Button>
              ) : null}
            </PermissionGate>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          فعلاً یک تأیید کافی است و معامله همان لحظه قطعی می‌شود. زیرساخت تأیید چندنفره در سرور مانده است.
        </p>
      </div>
      <ConfirmDialog
        open={action !== null}
        title={
          action === 'approve'
            ? 'تأیید نهایی'
            : action === 'reject'
              ? 'رد سفارش'
              : action === 'revision'
                ? 'درخواست اصلاح'
                : 'تأیید عملیات'
        }
        message={
          action === 'approve'
            ? 'با تأیید نهایی، معامله ساخته می‌شود و اعتبار رزروشده مصرف می‌گردد.'
            : action === 'reject'
              ? 'برای رد سفارش باید دلیل را بنویسید.'
              : 'پس از تأیید، وضعیت فقط مطابق قوانین سرور تغییر می‌کند.'
        }
        confirmLabel={action === 'reject' ? 'رد سفارش' : 'تأیید'}
        destructive={action === 'reject'}
        requireReason={action === 'reject' || action === 'revision'}
        minReason={action === 'revision' ? 10 : 5}
        isLoading={busy}
        onClose={() => setAction(null)}
        onConfirm={(reason) => void run(reason)}
      />
    </div>
  );
}
