'use client';

import { useEffect, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  BadgeDollarSign,
  Calculator,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock,
  Coins,
  FileText,
  Printer,
  Scale,
  Tag,
  Wallet,
} from 'lucide-react';
import {
  internalOrdersApi,
  internalQuotationsApi,
  internalTradesApi,
  type StaffQuotation,
} from '@/lib/internal-api';
import { saveBlob } from '@/lib/download';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { PermissionGate } from '@/components/dashboard/permission-gate';
import { ApiClientError } from '@/lib/api';
import { orderCanQuickApprove } from '@/lib/order-quotation';
import {
  QUOTATION_STATUS_LABELS,
  cn,
  formatDateTime,
  formatFaNumber,
  formatMoney,
  formatWeight,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';

export function QuotationDetails({
  quote,
  autoPrint = false,
  onChanged,
}: {
  quote: StaffQuotation;
  autoPrint?: boolean;
  onChanged?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const order = useSWR(quote.orderId ? ['quotation-order', quote.orderId] : null, () =>
    internalOrdersApi.getById(quote.orderId),
  );

  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  const orderStatus = order.data?.status;
  const quoteActive = quote.status === 'ACTIVE';
  const canApprove = quoteActive && orderCanQuickApprove(orderStatus);
  const canCreateTrade = quoteActive && orderStatus === 'APPROVED';

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const blob = await internalQuotationsApi.download(quote.id);
      saveBlob(blob, `${quote.quotationNumber}-v${quote.version}.json`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'دریافت فایل ممکن نیست.');
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await internalOrdersApi.approve(quote.orderId);
      setConfirmOpen(false);
      setFeedback('سفارش تأیید شد و معامله ایجاد گردید.');
      await order.mutate();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تأیید سفارش انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  const createTrade = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await internalTradesApi.confirm({ orderId: quote.orderId });
      setFeedback('معامله از سفارش تأییدشده ایجاد شد.');
      await order.mutate();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'ایجاد معامله انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  const totalFormatted = formatMoney(quote.totalAmountRial);
  const baseFormatted = formatMoney(quote.step1BasePrice);
  const statusText = statusLabel(QUOTATION_STATUS_LABELS, quote.status);

  return (
    <div className="quotation-sheet space-y-5">
      <header className="quotation-sheet-header flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <GoldBarsIcon className="quotation-deco mt-0.5 h-10 w-10 shrink-0 text-gold-500" />
          <div>
            <h3 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              پیش‌فاکتور طلا
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              مقادیر تاریخی دوباره محاسبه نمی‌شوند.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              نسخه {formatFaNumber(quote.version)}
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-2.5 self-start rounded-full border border-border bg-muted/60 px-3.5 py-2 shadow-sm">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-100 text-gold-700">
            <FileText className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 text-right">
            <p className="text-[11px] text-muted-foreground">شماره پیش‌فاکتور</p>
            <p className="font-semibold tabular-nums tracking-wide text-foreground" dir="ltr">
              {toPersianDigits(quote.quotationNumber)}
            </p>
          </div>
        </div>
      </header>

      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        {/* Summary column — visually left in RTL (second in DOM for desktop RTL) */}
        <div className="order-1 flex flex-col gap-3 lg:order-2">
          <div className="relative overflow-hidden rounded-2xl border border-gold-200/70 bg-gradient-to-bl from-gold-50 via-[#faf6ee] to-white p-4 shadow-sm sm:p-5">
            <div className="absolute -left-6 -top-8 quotation-deco h-28 w-28 rounded-full bg-gold-200/30 blur-2xl" />
            <div className="relative flex items-start justify-between gap-3">
              <StatusBadge
                status={quote.status}
                label={statusText}
                className="gap-1 border border-green-200/80 shadow-sm"
              />
              <GoldBarsStack className="quotation-deco hidden h-16 w-16 shrink-0 text-gold-500 sm:block" />
            </div>

            <div className="relative mt-4">
              <p className="text-sm text-muted-foreground">قیمت کل</p>
              <p className="mt-1 break-words text-2xl font-bold leading-tight text-foreground sm:text-3xl">
                {totalFormatted}
              </p>
            </div>

            <div className="relative mt-4 inline-flex max-w-full items-center gap-2 rounded-full border border-gold-200/80 bg-white/80 px-3 py-1.5 text-sm text-foreground shadow-sm">
              <Coins className="h-4 w-4 shrink-0 text-gold-600" aria-hidden />
              <span className="min-w-0 break-words">مبلغ فاکتور: {totalFormatted}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 divide-y divide-sky-100 overflow-hidden rounded-2xl border border-sky-100 bg-sky-50/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:divide-sky-100">
            <MetaCell
              icon={Clock}
              label="زمان"
              value={formatDateTime(quote.generatedAt)}
            />
            <MetaCell
              icon={CircleDot}
              label="رند"
              value={formatMoney(quote.roundingAmount)}
            />
            <MetaCell icon={CalendarDays} label="قیمت پایه" value={baseFormatted} />
          </div>
        </div>

        {/* Detail rows — visually right in RTL */}
        <div className="order-2 rounded-2xl border border-border bg-white p-3 shadow-sm sm:p-4 lg:order-1">
          <dl className="divide-y divide-border/70">
            <DetailRow icon={Scale} label="وزن" value={formatWeight(quote.weightGrams)} />
            <DetailRow icon={Tag} label="قیمت پایه" value={baseFormatted} />
            <DetailRow
              icon={BadgeDollarSign}
              label="کارمزد"
              value={formatMoney(quote.feeAmountRial)}
            />
            <DetailRow
              icon={Calculator}
              label="قیمت با احتساب اجرت"
              value={totalFormatted}
            />
            <DetailRow
              icon={Wallet}
              label="کامل"
              value={quote.isComplete ? 'بله' : 'خیر'}
            />
          </dl>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-start gap-2 print:hidden sm:justify-end">
        <PermissionGate anyOf="trade.approve">
          {canApprove ? (
            <Button
              className="min-w-[9.5rem] gap-2"
              disabled={busy}
              onClick={() => setConfirmOpen(true)}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              تأیید نهایی
            </Button>
          ) : null}
          {canCreateTrade ? (
            <Button
              className="min-w-[9.5rem] gap-2"
              disabled={busy}
              isLoading={busy}
              onClick={() => void createTrade()}
            >
              ادامه ایجاد معامله
            </Button>
          ) : null}
        </PermissionGate>
        {quote.documentAvailable ? (
          <Button
            className="min-w-[9.5rem] gap-2"
            isLoading={busy}
            onClick={() => void download()}
          >
            <FileText className="h-4 w-4" aria-hidden />
            دریافت سند
          </Button>
        ) : null}
        <Button
          variant="outline"
          className="min-w-[7rem] gap-2 border-gold-300 text-gold-800 hover:bg-gold-50"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4 sm:hidden" aria-hidden />
          <ArrowLeft className="hidden h-4 w-4 sm:inline" aria-hidden />
          چاپ
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="تأیید نهایی"
        message="با تأیید نهایی، معامله ساخته می‌شود و اعتبار رزروشده مصرف می‌گردد."
        confirmLabel="تأیید"
        isLoading={busy}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void approve()}
      />
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50 text-foreground">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <dt className="text-sm text-muted-foreground">{label}</dt>
      </div>
      <dd className="min-w-0 break-words text-sm font-semibold text-foreground">
        {value}
      </dd>
    </div>
  );
}

function MetaCell({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 px-3.5 py-3 sm:flex-col sm:items-center sm:justify-center sm:gap-1.5 sm:px-2 sm:py-3.5 sm:text-center">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sky-700 shadow-sm ring-1 ring-sky-100">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 sm:w-full">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words text-xs font-semibold text-foreground sm:text-[13px]">
          {value}
        </p>
      </div>
    </div>
  );
}

function GoldBarsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      aria-hidden
    >
      <rect x="4" y="22" width="20" height="8" rx="1.5" fill="currentColor" opacity="0.85" />
      <rect x="10" y="14" width="20" height="8" rx="1.5" fill="currentColor" />
      <rect x="16" y="6" width="20" height="8" rx="1.5" fill="currentColor" opacity="0.7" />
      <path d="M4 22l3-2h20l-3 2H4z" fill="currentColor" opacity="0.45" />
      <path d="M10 14l3-2h20l-3 2H10z" fill="currentColor" opacity="0.45" />
      <path d="M16 6l3-2h20l-3 2H16z" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

function GoldBarsStack({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="goldBarGrad" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fcd34d" />
          <stop offset="0.5" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <rect x="6" y="38" width="36" height="12" rx="2" fill="url(#goldBarGrad)" />
      <rect x="14" y="26" width="36" height="12" rx="2" fill="url(#goldBarGrad)" opacity="0.95" />
      <rect x="22" y="14" width="36" height="12" rx="2" fill="url(#goldBarGrad)" opacity="0.9" />
      <path d="M6 38l4-3h36l-4 3H6z" fill="#fef3c7" opacity="0.7" />
      <path d="M14 26l4-3h36l-4 3H14z" fill="#fef3c7" opacity="0.7" />
      <path d="M22 14l4-3h36l-4 3H22z" fill="#fef3c7" opacity="0.7" />
    </svg>
  );
}
