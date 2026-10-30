'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import useSWR from 'swr';
import { Download, Expand, FileText, Pencil, Printer, X } from 'lucide-react';
import { fetchBlob } from '@/lib/api';
import { internalCustomersApi, type StaffPayment } from '@/lib/internal-api';
import { usePrintPageSize } from '@/lib/print';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import { MobileNumber } from '@/components/ui/mobile-input';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  cn,
  formatDateTime,
  formatMoney,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';

function shortPaymentId(id: string): string {
  const compact = id.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `#${toPersianDigits(compact)}`;
}

function methodDetail(method: string): string {
  if (method === 'BANK_TRANSFER') return 'انتقال بانکی (پایا/ساتنا)';
  return statusLabel(PAYMENT_METHOD_LABELS, method);
}

function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '؟';
  return parts.slice(0, 2).map((part) => part[0]).join('');
}

function statusClass(status: string): string {
  if (status === 'PENDING') return 'bg-amber-50 text-amber-800 border-amber-200';
  if (status === 'FAILED' || status === 'REVERSED') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (['VALIDATED', 'ALLOCATED', 'COMPLETED'].includes(status)) {
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
  return '';
}

export function PaymentDetailModal({
  payment,
  canValidate,
  autoPrint = false,
  onClose,
  onApprove,
  onReject,
  onEdit,
}: {
  payment: StaffPayment;
  canValidate: boolean;
  autoPrint?: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  const customer = useSWR(payment.customerId ? ['payment-detail-customer', payment.customerId] : null, () =>
    internalCustomersApi.getById(payment.customerId),
  );
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptKind, setReceiptKind] = useState<'image' | 'pdf' | 'none'>('none');
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (zoomed) setZoomed(false);
        else onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, zoomed]);

  useEffect(() => {
    if (payment.direction === 'WITHDRAWAL' || !payment.hasReceipt) {
      setReceiptKind('none');
      setReceiptUrl(null);
      return;
    }
    let revoked: string | null = null;
    let cancelled = false;
    setReceiptError(null);
    void fetchBlob(`/payments/${payment.id}/receipt`)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoked = url;
        setReceiptUrl(url);
        setReceiptKind(blob.type === 'application/pdf' ? 'pdf' : 'image');
      })
      .catch(() => {
        if (!cancelled) {
          setReceiptKind('none');
          setReceiptError('بارگذاری فیش انجام نشد.');
        }
      });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [payment.hasReceipt, payment.direction, payment.id]);

  usePrintPageSize('A5 portrait');

  useEffect(() => {
    document.body.dataset.printDoc = 'true';
    return () => {
      delete document.body.dataset.printDoc;
    };
  }, []);

  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [autoPrint, payment.id]);

  const name = customer.data?.fullName ?? payment.customerName ?? 'مشتری';
  const mobile = customer.data?.mobile ?? payment.customerMobile ?? '';
  const verified = (customer.data?.verificationStatus ?? '') === 'VERIFIED';
  const pending = payment.status === 'PENDING';
  const note = payment.notes?.trim();
  const withdrawal = payment.direction === 'WITHDRAWAL';

  const downloadReceipt = () => {
    if (!receiptUrl) return;
    const link = document.createElement('a');
    link.href = receiptUrl;
    link.download = `receipt-${payment.id}${receiptKind === 'pdf' ? '.pdf' : '.jpg'}`;
    link.rel = 'noopener';
    link.click();
  };

  const rows = useMemo(() => {
    if (withdrawal) {
      return [
        { label: 'شناسه رهگیری سیستم', value: shortPaymentId(payment.id), ltr: true },
        { label: 'روش پرداخت', value: 'انتقال بانکی' },
        { label: 'بانک مقصد', value: payment.destinationBankName ?? '—' },
        {
          label: 'شماره شبا',
          value: payment.destinationIban ? toPersianDigits(payment.destinationIban) : '—',
          ltr: true,
        },
        { label: 'صاحب حساب', value: payment.destinationAccountHolder ?? '—' },
        { label: 'تاریخ ثبت', value: formatDateTime(payment.createdAt) },
      ];
    }
    return [
      { label: 'شناسه رهگیری سیستم', value: shortPaymentId(payment.id), ltr: true },
      { label: 'روش پرداخت', value: methodDetail(payment.method) },
      {
        label: 'شماره ارجاع/فیش',
        value: payment.referenceNumber ? toPersianDigits(payment.referenceNumber) : '—',
        ltr: true,
      },
      { label: 'تاریخ ثبت', value: formatDateTime(payment.createdAt) },
    ];
  }, [payment, withdrawal]);

  return createPortal(
    <div className="print-doc-host fixed inset-0 z-50 flex items-center justify-center p-4 print:p-0" dir="rtl">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 print:hidden"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-detail-title"
        className="print-doc relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:shadow-none"
      >
        <header className="print-screen-only flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <h2 id="payment-detail-title" className="text-base font-bold text-slate-900 sm:text-lg">
            {withdrawal ? 'جزئیات برداشت وجه' : 'جزئیات پرداخت و بررسی فیش'}
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" aria-hidden />
              چاپ
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="بستن"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="hidden print-doc-card print:block">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-300 pb-1.5">
            <p className="text-sm font-bold text-slate-900">
              {withdrawal ? 'برداشت وجه' : 'فیش پرداخت'} {shortPaymentId(payment.id)}
            </p>
            <p className="text-xs text-slate-600">{formatDateTime(payment.createdAt)}</p>
          </div>
          <p className="mt-1 text-xs text-slate-700">
            مشتری: {name}
            {mobile ? (
              <>
                {' — '}
                <MobileNumber value={mobile} />
              </>
            ) : null}
          </p>
        </div>

        <div className="print-doc-columns grid min-h-0 flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-2 print:overflow-visible print:p-0">
          <section className="relative min-h-[18rem] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 print:min-h-0">
            {withdrawal ? (
              <div className="flex h-full min-h-[18rem] flex-col justify-center gap-4 p-6 print:min-h-0">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <FileText className="h-4 w-4 text-slate-500" aria-hidden />
                  حساب مقصد برداشت
                </div>
                <dl className="space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500">بانک</dt>
                    <dd className="font-semibold text-slate-900">{payment.destinationBankName ?? '—'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500">شماره شبا</dt>
                    <dd className="font-mono font-semibold text-slate-900" dir="ltr">
                      {payment.destinationIban ? toPersianDigits(payment.destinationIban) : '—'}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500">صاحب حساب</dt>
                    <dd className="font-semibold text-slate-900">{payment.destinationAccountHolder ?? '—'}</dd>
                  </div>
                </dl>
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800">
                  {pending
                    ? 'مبلغ این برداشت تا زمان تأیید مالی رزرو شده است.'
                    : 'مبلغ از کیف پول کسر و به شماره شبا مقصد واریز شده است.'}
                </p>
              </div>
            ) : receiptKind === 'image' && receiptUrl ? (
              // Blob preview; next/image is not suitable for object URLs here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={receiptUrl} alt="فیش واریزی" className="h-full w-full object-contain p-4 print:max-h-[70mm] print:p-0" />
            ) : receiptKind === 'pdf' && receiptUrl ? (
              <div className="flex h-full min-h-[18rem] flex-col items-center justify-center gap-3 p-6 text-center print:min-h-0">
                <FileText className="h-12 w-12 text-slate-400" aria-hidden />
                <p className="text-sm font-medium text-slate-700">فیش به‌صورت PDF بارگذاری شده است.</p>
              </div>
            ) : (
              <div className="flex h-full min-h-[18rem] flex-col items-center justify-center gap-2 p-6 text-center print:min-h-0">
                <FileText className="h-10 w-10 text-slate-300" aria-hidden />
                <p className="text-sm text-slate-500">{receiptError ?? 'فیشی برای این پرداخت ثبت نشده است.'}</p>
              </div>
            )}
            {!withdrawal && receiptUrl ? (
              <div className="absolute left-3 top-3 flex gap-2 print:hidden">
                <button
                  type="button"
                  onClick={downloadReceipt}
                  aria-label="دانلود فیش"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-sm hover:bg-white"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => (receiptKind === 'pdf' ? window.open(receiptUrl, '_blank', 'noopener,noreferrer') : setZoomed(true))}
                  aria-label="بزرگ‌نمایی فیش"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-sm hover:bg-white"
                >
                  <Expand className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">
                {initials(name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{name}</p>
                {mobile ? (
                  <p className="mt-0.5 text-sm text-slate-500">
                    <MobileNumber value={mobile} />
                  </p>
                ) : null}
              </div>
              {verified ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  کاربر تایید شده
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  کاربر تایید نشده
                </span>
              )}
            </div>

            <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <dt className="text-sm text-slate-500">{withdrawal ? 'مبلغ برداشت' : 'مبلغ واریزی'}</dt>
                <dd className={cn('text-lg font-bold tabular-nums', withdrawal ? 'text-rose-600' : 'text-emerald-600')}>
                  {withdrawal ? '−' : ''}
                  {formatMoney(payment.amount)}
                </dd>
              </div>
              {rows.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3 px-4 py-3">
                  <dt className="text-sm text-slate-500">{row.label}</dt>
                  <dd
                    className={cn('text-sm font-medium text-slate-900', row.ltr && 'font-mono')}
                    dir={row.ltr ? 'ltr' : undefined}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-sm text-slate-500">وضعیت</dt>
                <dd>
                  <StatusBadge
                    status={payment.status}
                    label={statusLabel(PAYMENT_STATUS_LABELS, payment.status)}
                    className={statusClass(payment.status)}
                  />
                </dd>
              </div>
            </dl>

            {note ? (
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-600">
                توضیحات مشتری: {note}
              </div>
            ) : null}
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4 print:hidden">
          <div className="flex flex-wrap gap-2">
            {canValidate && pending ? (
              <>
                <button
                  type="button"
                  onClick={onApprove}
                  className="inline-flex min-h-11 items-center rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white hover:bg-emerald-600"
                >
                  {withdrawal ? '✓ تأیید و واریز به شبا' : '✓ تایید و اعمال پرداخت'}
                </button>
                <button
                  type="button"
                  onClick={onReject}
                  className="inline-flex min-h-11 items-center rounded-xl border border-red-500 px-4 text-sm font-bold text-red-500 hover:bg-red-50"
                >
                  ✕ رد درخواست
                </button>
              </>
            ) : null}
          </div>
          {!withdrawal ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              <Pencil className="h-4 w-4" aria-hidden />
              ویرایش اطلاعات
            </button>
          ) : null}
        </footer>
      </div>

      {zoomed && receiptUrl ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6 print:hidden">
          <button type="button" className="absolute inset-0" aria-label="بستن بزرگ‌نمایی" onClick={() => setZoomed(false)} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={receiptUrl} alt="فیش واریزی" className="relative z-10 max-h-full max-w-full rounded-xl object-contain" />
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
