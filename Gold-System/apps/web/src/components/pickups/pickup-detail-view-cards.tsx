'use client';

import { useState } from 'react';
import {
  Check,
  ClipboardList,
  Hammer,
  Handshake,
  PackageCheck,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import type { PhysicalGoldPickup } from '@/lib/api';
import { staffPickupsApi } from '@/lib/internal-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DetailRow, pickupCustomerName } from './pickup-cards';
import { PickupDocumentActions } from './pickup-document-actions';
import { PickupReceiptModal } from './pickup-receipt-modal';
import { CancelPickupModal } from './CancelPickupModal';
import { pickupActionsFor, PICKUP_FEE_STATUS_LABELS } from '@/lib/pickup-workflow';
import {
  pickupStepTimestamps,
  cancelledReachedIndex,
} from '@/components/portal/pickups/pickup-status-stepper';
import { cn, formatDateTime, rialToToman, PICKUP_STATUS_LABELS, statusLabel } from '@/lib/utils';

const tomanFormatter = new Intl.NumberFormat('fa-IR');
function formatPickupToman(value: string | number | null | undefined) {
  const toman = rialToToman(value);
  if (toman == null) return '—';
  return `${tomanFormatter.format(BigInt(toman.split('.')[0]))} تومان`;
}

const STAGES = ['REQUESTED', 'PREPARING', 'READY', 'DELIVERED'] as const;
const ICONS = [ClipboardList, Hammer, PackageCheck, Handshake];

export function PickupDeliveryProgress({ pickup }: { pickup: PhysicalGoldPickup }) {
  const timestamps = pickupStepTimestamps(pickup);
  const cancelled = pickup.status === 'CANCELLED';
  const current = cancelled
    ? cancelledReachedIndex(timestamps)
    : STAGES.findIndex((step) => step === pickup.status);
  return (
    <div className="py-5" dir="rtl">
      <ol className="grid gap-5 sm:grid-cols-4 sm:gap-0" aria-label="مراحل تحویل حضوری">
        {STAGES.map((step, index) => {
          const reached = index <= current;
          const complete =
            reached && (index < current || pickup.status === 'DELIVERED' || cancelled);
          const active = index === current && !cancelled && pickup.status !== 'DELIVERED';
          const Icon = complete || (active && index === 0) ? Check : ICONS[index];
          return (
            <li
              key={step}
              aria-current={active ? 'step' : undefined}
              className="relative flex items-start gap-3 sm:flex-col sm:items-center sm:gap-3 sm:text-center"
            >
              {index < 3 ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute start-5 top-5 h-[calc(100%+1.25rem)] w-0.5 sm:start-1/2 sm:top-5 sm:h-1 sm:w-full',
                    index < current
                      ? 'bg-emerald-600'
                      : 'bg-gradient-to-l from-emerald-500/50 via-gold-400 to-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.25)]',
                  )}
                />
              ) : null}
              <span
                className={cn(
                  'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors duration-500',
                  active && 'motion-safe:animate-pulse',
                  reached
                    ? 'border-emerald-500 bg-emerald-600 text-white shadow-[0_0_16px_rgba(16,185,129,0.25)]'
                    : 'border-gold-200 bg-gradient-to-bl from-gold-50 to-gold-200 text-gold-700',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="relative min-w-0 space-y-1.5 sm:px-1">
                <p
                  className={cn(
                    'text-xs font-semibold leading-5 lg:text-sm',
                    reached ? 'text-slate-900' : 'text-slate-500',
                  )}
                >
                  {PICKUP_STATUS_LABELS[step]}
                </p>
                <span
                  className={cn(
                    'inline-block rounded-full px-2 py-0.5 text-[10px]',
                    reached ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {complete ? 'تکمیل‌شده' : active ? 'مرحله جاری' : 'در انتظار'}
                </span>
                {reached && timestamps[step] ? (
                  <time
                    dateTime={timestamps[step]!}
                    className="block text-[10px] leading-5 text-slate-500"
                  >
                    {formatDateTime(timestamps[step]!)}
                  </time>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {cancelled ? (
        <p className="mt-5 text-xs text-rose-700">درخواست لغو شده؛ مراحل بعدی متوقف شده‌اند.</p>
      ) : null}
    </div>
  );
}

export function PickupFinance({
  pickup,
  downloadPreInvoice,
  downloadInvoice,
  onPrint,
}: {
  pickup: PhysicalGoldPickup;
  downloadPreInvoice?: () => Promise<Blob>;
  downloadInvoice?: () => Promise<Blob>;
  onPrint?: () => void;
}) {
  const fee = pickup.fee;
  const [receiptOpen, setReceiptOpen] = useState(false);
  const rate =
    fee?.mode === 'PERCENTAGE'
      ? `${Number(fee.rateValue).toLocaleString('fa-IR', { maximumFractionDigits: 6 })}٪`
      : fee?.mode === 'FIXED'
        ? 'مبلغ ثابت'
        : fee?.mode === 'NONE'
          ? 'بدون کارمزد'
          : '—';
  return (
    <>
      <Card className="relative rounded-sm border-x border-y-2 border-dashed border-gold-300 bg-white shadow-[0_5px_25px_rgba(100,80,30,0.07)]">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b border-gold-200 p-5">
          <CardTitle className="flex items-center gap-2 text-base text-slate-950">
            <Receipt className="h-5 w-5 text-gold-600" aria-hidden />
            کارمزد تبدیل به فیزیکی
          </CardTitle>
          <span className="rounded-lg bg-gradient-to-bl from-gold-500 to-gold-700 px-3 py-1 text-xs font-medium text-white">
            Invoice
          </span>
        </CardHeader>
        <CardContent className="p-5">
          <dl className="space-y-1 text-sm [&_dt]:shrink [&_dt]:leading-6 [&_dd]:min-w-0 [&_dt]:max-w-[45%]">
            <DetailRow
              label="نوع کارمزد"
              value={
                fee?.status === 'RESERVED'
                  ? 'رزرو شده از کیف پول'
                  : PICKUP_FEE_STATUS_LABELS[fee?.status ?? 'NONE']
              }
            />
            <DetailRow label="کارمزد" value={rate} />
            <DetailRow
              label="مبلغ کارمزد"
              value={
                <span className="text-lg font-bold text-slate-950">
                  {formatPickupToman(fee?.amountRial)}
                </span>
              }
            />
            <DetailRow
              label="ارزش طلا (مبنای محاسبه)"
              value={formatPickupToman(fee?.mode === 'PERCENTAGE' ? fee.baseAmountRial : null)}
            />
            <DetailRow
              label="موجودی پس از رزرو"
              value={formatPickupToman(fee?.walletAvailableAfterRial)}
              className="print:hidden"
            />
          </dl>
          <div className="mt-5 border-t border-dashed border-gold-200 pt-4 print:hidden">
            <PickupDocumentActions
              receiptStyle
              invoiceLabel="فاکتور نهایی"
              size="default"
              pickupNumber={pickup.pickupNumber}
              documents={pickup.documents}
              downloadPreInvoice={
                downloadPreInvoice ?? (() => staffPickupsApi.downloadPreInvoice(pickup.id))
              }
              downloadInvoice={
                downloadInvoice ?? (() => staffPickupsApi.downloadInvoice(pickup.id))
              }
              onPrint={
                onPrint ??
                (() => (pickup.status === 'DELIVERED' ? setReceiptOpen(true) : window.print()))
              }
            />
          </div>
        </CardContent>
      </Card>
      <PickupReceiptModal
        pickup={pickup}
        open={receiptOpen}
        autoPrint
        onClose={() => setReceiptOpen(false)}
      />
    </>
  );
}

export function PickupVerification({
  pickup,
  audience = 'staff',
}: {
  pickup: PhysicalGoldPickup;
  audience?: 'staff' | 'customer';
}) {
  return (
    <section
      aria-label="احراز هویت و تحویل"
      className="rounded-xl border border-gold-300 bg-gradient-to-bl from-amber-50 to-gold-50 p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2 text-gold-900">
        <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden />
        <h2 className="text-sm font-bold">کد تأیید تحویل حضوری:</h2>
        <span className="ms-auto rounded-lg bg-gold-200/50 px-3 py-2 text-sm font-bold">
          در دسترس نیست
        </span>
      </div>
      <p className="mt-3 text-xs leading-6 text-gold-900/80">
        {audience === 'customer'
          ? 'کد تأیید در اطلاعات این درخواست ارائه نشده است. برای تحویل، مدرک هویتی خود را به همراه داشته باشید.'
          : `${pickupCustomerName(pickup) || 'پرونده مشتری'} — کد تأیید در اطلاعات این درخواست ارائه نشده است. هویت مشتری را پیش از تحویل در باجه بررسی کنید.`}
      </p>
    </section>
  );
}

export function PickupCancelAction({
  pickup,
  canCancel,
  onCancelled,
  audience = 'staff',
}: {
  pickup: PhysicalGoldPickup;
  canCancel: boolean;
  audience?: 'staff' | 'customer';
  onCancelled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const eligible =
    audience === 'customer'
      ? pickup.status === 'REQUESTED'
      : pickupActionsFor(pickup.status, { prepare: false, deliver: false, cancel: canCancel })
          .cancel;
  if (!canCancel || !eligible) return null;
  return (
    <div className="print:hidden">
      <Button
        variant="outline"
        className="w-full border-rose-200 bg-transparent text-rose-700 hover:bg-rose-50"
        onClick={() => setOpen(true)}
      >
        لغو درخواست
      </Button>
      {open ? (
        <CancelPickupModal
          audience={audience}
          pickup={pickup}
          onClose={() => setOpen(false)}
          onSuccess={onCancelled}
        />
      ) : null}
    </div>
  );
}

export function PickupAuditLog({
  pickup,
  showActors = true,
}: {
  pickup: PhysicalGoldPickup;
  showActors?: boolean;
}) {
  const events = [...pickup.events].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const entries = events.length
    ? events
    : STAGES.filter((step) => pickupStepTimestamps(pickup)[step]).map((step) => ({
        id: step,
        status: step,
        createdAt: pickupStepTimestamps(pickup)[step]!,
        actorId: null,
        note: null,
      }));
  return (
    <Card
      role="region"
      aria-label="زمان‌بندی مراحل"
      className="overflow-hidden rounded-2xl border-slate-200 shadow-sm"
    >
      <CardHeader className="border-b border-slate-200 px-6 py-5">
        <CardTitle className="text-base">زمان‌بندی مراحل</CardTitle>
      </CardHeader>
      <CardContent className="px-6 py-6">
        <ol className="space-y-7 border-s border-slate-200 ps-6">
          {entries.map((event) => (
            <li key={event.id} className="relative space-y-2 text-sm">
              <span
                className={cn(
                  'absolute -start-[37px] top-0 flex h-6 w-6 items-center justify-center rounded-full border-4 border-white',
                  event.status === 'DELIVERED' ? 'bg-emerald-500' : 'bg-gold-400',
                )}
                aria-hidden
              >
                <Check className="h-3 w-3 text-white" />
              </span>
              <p className="font-bold text-slate-900">
                {statusLabel(PICKUP_STATUS_LABELS, event.status)}
              </p>
              <p className="text-xs text-slate-500">زمان‌بندی تحویل آب‌شده حضوری</p>
              <time
                dateTime={event.createdAt}
                className="block text-xs tabular-nums text-slate-500"
              >
                {formatDateTime(event.createdAt)}
              </time>
              {showActors && event.actorId ? (
                <p className="text-xs text-slate-500">عامل ثبت: کاربر سامانه (نام ارائه نشده)</p>
              ) : null}
              {event.note ? (
                <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs leading-6">
                  {event.note}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
        {!entries.length ? <p className="text-sm text-slate-500">فعالیتی ثبت نشده است.</p> : null}
      </CardContent>
    </Card>
  );
}
