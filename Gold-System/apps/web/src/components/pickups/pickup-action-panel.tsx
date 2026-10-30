'use client';

import { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Info,
  Printer,
  UserRound,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { DatePickerJalali } from '@/components/ui/date-picker-jalali';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { PickupReceiptModal } from '@/components/pickups/pickup-receipt-modal';
import { staffPickupsApi } from '@/lib/internal-api';
import { ApiClientError, type PhysicalGoldPickup } from '@/lib/api';
import { pickupActionsFor } from '@/lib/pickup-workflow';
import { formatDate, formatDateTime, formatWholeMoney } from '@/lib/utils';

/**
 * State-dependent operational actions for the staff pickup detail page.
 *
 * Only the actions valid in the current status are rendered; the transition
 * table lives server-side (`pickup-states.ts`). Every action goes through the
 * existing staff endpoints and refreshes the parent via `onChanged`.
 */
export function PickupActionPanel({
  pickup,
  canPrepare,
  canDeliver,
  canCancel,
  onChanged,
}: {
  pickup: PhysicalGoldPickup;
  canPrepare: boolean;
  canDeliver: boolean;
  canCancel: boolean;
  onChanged: () => void;
}) {
  const [scheduledPickupAt, setScheduledPickupAt] = useState('');
  const [staffNote, setStaffNote] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptPrint, setReceiptPrint] = useState(false);

  const actions = pickupActionsFor(pickup.status, {
    prepare: canPrepare,
    deliver: canDeliver,
    cancel: canCancel,
  });

  const hasDeliveryFee =
    !!pickup.fee && pickup.fee.mode !== 'NONE' && Number(pickup.fee.amountRial) > 0;
  const deliveryConfirmMessage = hasDeliveryFee
    ? `با ثبت تحویل، کارمزد تبدیل ${formatWholeMoney(pickup.fee?.amountRial)} از موجودی ریالی کیف پول مشتری کسر می‌شود. ادامه می‌دهید؟`
    : 'با ثبت تحویل، قالب آب‌شده به مشتری تحویل داده می‌شود. ادامه می‌دهید؟';

  async function run(label: string, fn: () => Promise<unknown>, successMessage: string) {
    setBusy(label);
    setActionError(null);
    setFeedback(null);
    try {
      await fn();
      setFeedback(successMessage);
      onChanged();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'عملیات ناموفق بود.');
    } finally {
      setBusy(null);
    }
  }

  function startPreparation() {
    if (!scheduledPickupAt) {
      setDateError('تاریخ تحویل را از تقویم انتخاب کنید.');
      setFeedback(null);
      return;
    }
    setDateError(null);
    void run(
      'prepare',
      () =>
        staffPickupsApi.markPreparing(pickup.id, {
          scheduledPickupAt,
          staffNote: staffNote.trim() || undefined,
        }),
      'آماده‌سازی شروع شد.',
    );
  }

  async function onCancel(reason?: string) {
    if (!reason || !reason.trim()) return;
    setCancelError(null);
    setBusy('cancel');
    try {
      await staffPickupsApi.cancel(pickup.id, reason.trim());
      setCancelOpen(false);
      setFeedback('درخواست لغو شد.');
      onChanged();
    } catch (err) {
      setCancelError(err instanceof ApiClientError ? err.message : 'لغو ناموفق بود.');
    } finally {
      setBusy(null);
    }
  }

  // Terminal states have no ordinary operational actions.
  if (pickup.status === 'DELIVERED' || pickup.status === 'CANCELLED') {
    if (pickup.status !== 'DELIVERED') return null;
    return (
      <Card className="flex h-full flex-col">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
          <CardTitle className="text-base">تحویل انجام شد</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
        </CardHeader>
        <CardContent className="flex flex-1 flex-col p-4 pt-0">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Fact
              label="تاریخ و زمان تحویل"
              value={pickup.deliveredAt ? formatDateTime(pickup.deliveredAt) : '—'}
              icon={Clock}
            />
            <Fact
              label="تحویل‌دهنده"
              value={pickup.deliveredByName?.trim() || 'کارشناس فروشگاه'}
              icon={UserRound}
            />
          </dl>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            تحویل ثبت شده است و امکان لغو یا تغییر وضعیت وجود ندارد. برای امضای مشتری، رسید
            تحویل را مشاهده یا چاپ کنید.
          </p>
          <div className="mt-auto flex flex-wrap gap-2 pt-3">
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => {
                setReceiptPrint(false);
                setReceiptOpen(true);
              }}
            >
              نمایش
            </Button>
            <Button
              className="gap-1"
              disabled={busy !== null}
              onClick={() => {
                setReceiptPrint(true);
                setReceiptOpen(true);
              }}
            >
              <Printer className="h-4 w-4" aria-hidden />
              چاپ
            </Button>
          </div>
        </CardContent>
        <PickupReceiptModal
          pickup={pickup}
          open={receiptOpen}
          autoPrint={receiptPrint}
          onClose={() => {
            setReceiptOpen(false);
            setReceiptPrint(false);
          }}
        />
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="text-base">اقدامات</CardTitle>
        <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="flex-1 space-y-4 p-4 pt-0">
        {/* Preparation form — only before preparation has started */}
        {actions.startPreparation ? (
          <>
            <DatePickerJalali
              label="تاریخ تحویل حضوری"
              value={scheduledPickupAt}
              onChange={(value) => {
                setScheduledPickupAt(value);
                setDateError(null);
              }}
              allowFuture
              required
              error={dateError ?? undefined}
              hint="هنگام شروع آماده‌سازی، تاریخ مراجعه مشتری به فروشگاه را انتخاب کنید."
            />
            <Textarea
              id="staff-note"
              label="یادداشت کارمند (اختیاری)"
              value={staffNote}
              onChange={(e) => setStaffNote(e.target.value)}
              maxLength={1000}
              placeholder="توضیحاتی درباره آماده‌سازی یا تحویل"
            />
          </>
        ) : null}

        {/* Preparation in progress — read-only status + ready action */}
        {pickup.status === 'PREPARING' ? (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Fact
              label="شروع آماده‌سازی"
              value={pickup.preparingAt ? formatDateTime(pickup.preparingAt) : '—'}
              icon={Clock}
            />
            <Fact
              label="آماده‌کننده"
              value={pickup.preparingByName?.trim() || 'کارشناس فروشگاه'}
              icon={UserRound}
            />
            <Fact
              label="زمان تحویل برنامه‌ریزی‌شده"
              value={pickup.scheduledPickupAt ? formatDate(pickup.scheduledPickupAt) : '—'}
              icon={Calendar}
            />
          </dl>
        ) : null}

        {/* Ready for delivery — status + handover action */}
        {pickup.status === 'READY' ? (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Fact
              label="آماده تحویل در"
              value={pickup.readyAt ? formatDateTime(pickup.readyAt) : '—'}
              icon={Clock}
            />
            <Fact
              label="زمان تحویل برنامه‌ریزی‌شده"
              value={pickup.scheduledPickupAt ? formatDate(pickup.scheduledPickupAt) : '—'}
              icon={Calendar}
            />
          </dl>
        ) : null}

        {/* Optional note captured alongside the next transition */}
        {pickup.status === 'PREPARING' || pickup.status === 'READY' ? (
          <Textarea
            id="staff-note"
            label="یادداشت کارمند (اختیاری)"
            value={staffNote}
            onChange={(e) => setStaffNote(e.target.value)}
            maxLength={1000}
            placeholder="توضیحاتی درباره آماده‌سازی یا تحویل"
          />
        ) : null}

        <div className="flex flex-wrap gap-2">
          {actions.startPreparation ? (
            <Button disabled={busy !== null} onClick={startPreparation} isLoading={busy === 'prepare'}>
              شروع آماده‌سازی
            </Button>
          ) : null}
          {actions.markReady ? (
            <Button
              disabled={busy !== null}
              isLoading={busy === 'ready'}
              onClick={() =>
                void run(
                  'ready',
                  () => staffPickupsApi.markReady(pickup.id, staffNote.trim() || undefined),
                  'آماده تحویل شد.',
                )
              }
            >
              اعلام آماده تحویل
            </Button>
          ) : null}
          {actions.registerDelivery ? (
            <Button
              disabled={busy !== null}
              onClick={() => {
                setActionError(null);
                setDeliverOpen(true);
              }}
            >
              ثبت تحویل در فروشگاه
            </Button>
          ) : null}
          {actions.cancel ? (
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => {
                setCancelError(null);
                setCancelOpen(true);
              }}
            >
              لغو درخواست تحویل
            </Button>
          ) : null}
        </div>

        {feedback ? <Alert variant="success">{feedback}</Alert> : null}
        {actionError ? <Alert variant="error">{actionError}</Alert> : null}
      </CardContent>

      <ConfirmDialog
        open={deliverOpen}
        title="ثبت تحویل در فروشگاه"
        message={deliveryConfirmMessage}
        confirmLabel="ثبت تحویل"
        isLoading={busy === 'deliver'}
        onClose={() => setDeliverOpen(false)}
        onConfirm={() => {
          setDeliverOpen(false);
          void run(
            'deliver',
            () => staffPickupsApi.deliver(pickup.id, staffNote.trim() || undefined),
            'تحویل ثبت شد.',
          );
        }}
      />

      <ConfirmDialog
        open={cancelOpen}
        title="لغو درخواست تحویل"
        message="با لغو، درخواست تحویل حضوری متوقف می‌شود و وزن رزرو شده آزاد می‌گردد. معامله طلا و سفارش خرید لغو نمی‌شود."
        confirmLabel="لغو درخواست"
        destructive
        requireReason
        reasonLabel="دلیل لغو"
        minReason={5}
        isLoading={busy === 'cancel'}
        error={cancelError}
        onClose={() => setCancelOpen(false)}
        onConfirm={(reason) => void onCancel(reason)}
      />
    </Card>
  );
}

function Fact({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Clock;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium">{value}</dd>
      </div>
    </div>
  );
}
