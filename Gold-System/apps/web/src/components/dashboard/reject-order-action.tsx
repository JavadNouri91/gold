'use client';

import { useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { internalOrdersApi } from '@/lib/internal-api';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';

export function RejectOrderAction({ orderId, status }: { orderId: string; status: string }) {
  const { user } = useAuth();
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  if (
    !hasPermission(user?.permissions, 'order.reject') ||
    !['SUBMITTED', 'QUOTED', 'ASSIGNED', 'UNDER_REVIEW'].includes(status)
  )
    return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason.trim() || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await internalOrdersApi.reject(orderId, reason.trim());
      setOpen(false);
      setReason('');
      await mutate(() => true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'رد سفارش ناموفق بود');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
        رد سفارش
      </Button>
      <Modal
        open={open}
        title="رد سفارش"
        onClose={() => {
          if (!submitting.current) setOpen(false);
        }}
      >
        <form onSubmit={submit} className="space-y-4" dir="rtl">
          <p>با رد سفارش، دارایی و کارمزد رزروشده آزاد می‌شود.</p>
          <Textarea
            id={`reject-order-${orderId}`}
            label="دلیل رد سفارش"
            required
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
          />
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button
              type="submit"
              variant="destructive"
              isLoading={busy}
              disabled={busy || !reason.trim()}
            >
              تأیید رد سفارش
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
