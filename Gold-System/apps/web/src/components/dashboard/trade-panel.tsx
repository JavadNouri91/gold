'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from './confirm-dialog';
import { PermissionGate } from './permission-gate';
import { internalTradesApi } from '@/lib/internal-api';
import { ApiClientError } from '@/lib/api';

export function TradeApprovalPanel({
  tradeId,
  status,
  onChanged,
}: {
  tradeId: string;
  status: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reverse = async (reason?: string) => {
    setBusy(true);
    setError(null);
    try {
      await internalTradesApi.reverse(tradeId, reason ?? '');
      setFeedback('درخواست برگشت ثبت شد.');
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'برگشت معامله انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      <PermissionGate anyOf="trade.approve">
        <Button variant="destructive" disabled={status !== 'CONFIRMED'} onClick={() => setOpen(true)}>
          برگشت معامله
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          وضعیت فعلی: {status}. دکمه فقط برای وضعیت تأییدشده فعال است؛ پذیرش نهایی با سرور است.
        </p>
      </PermissionGate>
      <ConfirmDialog
        open={open}
        title="برگشت معامله"
        message="دلیل برگشت الزامی است. مانده‌ها فقط در سرور اصلاح می‌شوند."
        destructive
        requireReason
        minReason={10}
        isLoading={busy}
        confirmLabel="ثبت برگشت"
        onClose={() => setOpen(false)}
        onConfirm={(reason) => void reverse(reason)}
      />
    </div>
  );
}
