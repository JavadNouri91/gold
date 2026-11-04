'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSWRConfig } from 'swr';
import { TriangleAlert } from 'lucide-react';
import { ApiClientError, pickupsApi, type PhysicalGoldPickup } from '@/lib/api';
import { staffPickupsApi } from '@/lib/internal-api';
import { toPersianDigits } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Toast } from '@/components/dashboard/customer-widgets';

export const CANCEL_PICKUP_SUCCESS = 'درخواست با موفقیت لغو شد و طلا به کیف پول کاربر بازگشت';

export interface CancelPickupModalProps {
  pickup: PhysicalGoldPickup;
  audience?: 'staff' | 'customer';
  onClose: () => void;
  /** The caller shows a success toast outside the dialog so it survives closing. */
  onSuccess: (pickup: PhysicalGoldPickup) => void;
}

/** Mount when opened; unmount on close to clear the reason and error. */
export function CancelPickupModal({
  pickup,
  onClose,
  onSuccess,
  audience = 'staff',
}: CancelPickupModalProps) {
  const { mutate } = useSWRConfig();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    const trigger = document.activeElement;
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  const cancelable =
    audience === 'customer'
      ? pickup.status === 'REQUESTED'
      : ['REQUESTED', 'PREPARING', 'READY'].includes(pickup.status);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed || submitting.current || !cancelable) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    let cancelled: PhysicalGoldPickup;
    try {
      cancelled = await (audience === 'customer' ? pickupsApi : staffPickupsApi).cancel(
        pickup.id,
        trimmed,
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'لغو درخواست ناموفق بود.');
      submitting.current = false;
      setBusy(false);
      return;
    }
    // Refresh all cached list filters and detail views, including portal views.
    // A refresh failure must not turn a successful cancellation into an API error.
    void mutate((key) => {
      const scope = Array.isArray(key) ? key[0] : key;
      return (
        typeof scope === 'string' &&
        ['staff-pickups', 'staff-pickup', 'portal-pickups', 'portal-pickup'].includes(scope)
      );
    }).catch(() => undefined);
    onSuccess(cancelled);
    onClose();
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!submitting.current) onClose();
      }}
      title={
        <span className="flex items-center gap-2" dir="rtl">
          <TriangleAlert className="h-5 w-5 shrink-0" aria-hidden />
          لغو درخواست تحویل حضوری طلا
        </span>
      }
      className="mx-4 max-h-[90dvh] max-w-lg overflow-y-auto"
      titleClassName="text-right text-rose-900"
    >
      <form
        onSubmit={submit}
        dir="rtl"
        className="space-y-4"
        aria-busy={busy}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'textarea:not(:disabled), button:not(:disabled)',
            ),
          );
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
          <TriangleAlert className="mt-1 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
          <p>
            با لغو این درخواست، وزن طلای رزرو شده به موجودی آزاد کیف پول کاربر بازگردانده شده و
            کارمزد مسدودشده آزاد می‌شود.
          </p>
        </div>
        <dl className="space-y-3 rounded-xl bg-muted/50 p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">شماره پیگیری</dt>
            <dd dir="ltr" className="font-medium tabular-nums">
              {toPersianDigits(pickup.pickupNumber)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">نام مشتری</dt>
            <dd className="break-words font-medium">
              {pickup.customer
                ? `${pickup.customer.firstName} ${pickup.customer.lastName}`.trim()
                : 'پرونده مشتری'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">وزن طلا</dt>
            <dd className="font-medium tabular-nums">
              {Number(pickup.weightGrams).toLocaleString('fa-IR', { maximumFractionDigits: 6 })} گرم
            </dd>
          </div>
        </dl>
        <Textarea
          id="cancel-pickup-reason"
          label="دلیل لغو / رد درخواست"
          required
          autoFocus
          rows={4}
          maxLength={audience === 'customer' ? 500 : undefined}
          placeholder="علت لغو درخواست را به طور کامل توضیح دهید..."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={busy}
        />
        {error ? <Toast message={error} tone="error" onClose={() => setError(null)} /> : null}
        <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            انصراف
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={busy || !reason.trim() || !cancelable}
            isLoading={busy}
          >
            تأیید و لغو درخواست
          </Button>
        </div>
      </form>
    </Modal>
  );
}
