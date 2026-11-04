'use client';

import { useRef, useState } from 'react';
import { ApiClientError, type PhysicalGoldPickup } from '@/lib/api';
import { staffPickupsApi } from '@/lib/internal-api';
import { formatWeight } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';

export function RejectPickupModal({
  pickup,
  onClose,
  onRejected,
}: {
  pickup: PhysicalGoldPickup;
  onClose: () => void;
  onRejected: (pickup: PhysicalGoldPickup) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason.trim() || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const cancelled = await staffPickupsApi.cancel(pickup.id, reason.trim());
      onRejected(cancelled);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'لغو درخواست ناموفق بود.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!submitting.current) onClose();
      }}
      title="رد درخواست تحویل حضوری"
    >
      <form onSubmit={submit} className="space-y-4" dir="rtl" aria-busy={busy}>
        <dl className="space-y-2 rounded-lg bg-muted p-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt>شماره پیگیری</dt>
            <dd dir="ltr">{pickup.pickupNumber}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>مشتری</dt>
            <dd>
              {pickup.customer
                ? `${pickup.customer.firstName} ${pickup.customer.lastName}`.trim()
                : 'پرونده مشتری'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>وزن طلا</dt>
            <dd>{formatWeight(pickup.weightGrams)}</dd>
          </div>
        </dl>
        <Textarea
          id="pickup-rejection-reason"
          label="دلیل رد درخواست"
          placeholder="دلیل رد یا لغو درخواست را وارد کنید..."
          required
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={busy}
        />
        {error ? <Alert variant="error">{error}</Alert> : null}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            انصراف
          </Button>
          <Button
            type="submit"
            variant="destructive"
            isLoading={busy}
            disabled={busy || !reason.trim()}
          >
            تأیید و رد درخواست
          </Button>
        </div>
      </form>
    </Modal>
  );
}
