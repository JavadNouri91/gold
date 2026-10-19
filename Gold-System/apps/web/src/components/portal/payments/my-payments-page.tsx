'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronLeft,
  CircleCheck,
  CircleX,
  Clock3,
  Copy,
  Download,
  FileSpreadsheet,
  Plus,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  WalletCards,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Payment, PaymentLedgerType, PaymentStatusGroup, PaymentSummary } from '@/lib/api';
import type { PaginationMeta } from '@gold/shared-types';
import { PAYMENT_RANGE_OPTIONS, type ActivityRangePreset } from '@/lib/activity-range';
import {
  PAYMENT_STATUS_CHIPS,
  PAYMENT_STATUS_FILTERS,
  PAYMENT_STATUS_FILTERS_COMPACT,
  PAYMENT_TYPE_FILTERS,
  paymentStamp,
  paymentStatusLabel,
  paymentTone,
  paymentTrackingCode,
  paymentTypeMethodLabel,
  relatedPaymentLabel,
  type PaymentTone,
} from '@/lib/payment-display';
import { DatePickerJalali } from '@/components/ui/date-picker-jalali';
import { InboxSheet } from '@/components/portal/notifications/inbox-sheet';
import { SubmitReceiptButton } from '@/components/portal/payments/submit-receipt-sheet';
import { WithdrawRequestButton } from '@/components/portal/payments/withdraw-request-sheet';
import { PAYMENT_METHOD_LABELS, cn, formatMoney, toPersianDigits } from '@/lib/utils';

const selectClass =
  'min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600';

const toneClass: Record<PaymentTone, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-600',
  blue: 'bg-blue-50 text-blue-700',
  orange: 'bg-amber-50 text-amber-700',
  muted: 'bg-slate-100 text-slate-600',
};

function StatusIcon({ status }: { status: string }) {
  const tone = paymentTone(status);
  const Icon: LucideIcon =
    tone === 'green' ? CircleCheck : tone === 'red' ? CircleX : tone === 'blue' ? RefreshCcw : tone === 'orange' ? Clock3 : WalletCards;
  return <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />;
}

export function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        toneClass[paymentTone(status)],
      )}
    >
      <StatusIcon status={status} />
      {paymentStatusLabel(status)}
    </span>
  );
}

function emptyBucket() {
  return { count: 0, amountRial: '0' };
}

function readSubmitted(summary: PaymentSummary) {
  return summary.submitted ?? emptyBucket();
}

function addAmounts(a: string, b: string): string {
  const sum = Number(a) + Number(b);
  if (!Number.isFinite(sum)) return '0';
  return sum.toFixed(2);
}

export function MyPaymentsPage({
  preset,
  onPreset,
  customFrom,
  customTo,
  onCustomFrom,
  onCustomTo,
  statusGroup,
  onStatusGroup,
  type,
  onType,
  search,
  onSearch,
  page,
  limit,
  onPage,
  onLimit,
  summary,
  summaryLoading,
  summaryError,
  onRetrySummary,
  payments,
  listLoading,
  listError,
  onRetryList,
  meta,
  rangeReady,
  onReceiptSubmitted,
  availableRial,
}: {
  preset: ActivityRangePreset;
  onPreset: (preset: ActivityRangePreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFrom: (value: string) => void;
  onCustomTo: (value: string) => void;
  statusGroup: '' | PaymentStatusGroup;
  onStatusGroup: (status: '' | PaymentStatusGroup) => void;
  type: '' | PaymentLedgerType;
  onType: (type: '' | PaymentLedgerType) => void;
  search: string;
  onSearch: (value: string) => void;
  page: number;
  limit: number;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
  summary?: PaymentSummary;
  summaryLoading: boolean;
  summaryError: boolean;
  onRetrySummary: () => void;
  payments: Payment[];
  listLoading: boolean;
  listError: boolean;
  onRetryList: () => void;
  meta?: PaginationMeta;
  rangeReady: boolean;
  onReceiptSubmitted: () => void;
  availableRial?: string | null;
}) {
  const filtersActive = Boolean(statusGroup || type || search.trim());
  const rows = payments;
  const showOnboarding = Boolean(summary && !summary.hasAny && !filtersActive && (meta?.total ?? 0) === 0);

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-4 overflow-x-hidden">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold text-gray-900 lg:text-[26px]">مدیریت واریز و برداشت</h1>
          <p className="mt-1 max-w-2xl text-sm leading-7 text-gray-500">
            افزایش اعتبار کیف پول، پیگیری وضعیت واریزها و مشاهده سوابق تراکنش‌های ریالی
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <WithdrawRequestButton
            availableRial={availableRial}
            onRequested={onReceiptSubmitted}
            label="درخواست برداشت وجه"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          />
          <SubmitReceiptButton
            onSubmitted={onReceiptSubmitted}
            label="+ افزایش اعتبار (واریز)"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          />
        </div>
      </header>

      {summaryError ? (
        <ErrorPanel message="پرداخت‌ها قابل دریافت نیست." onRetry={onRetrySummary} />
      ) : summaryLoading && !summary ? (
        <SummarySkeleton />
      ) : summary ? (
        <SummaryCards
          summary={summary}
          availableRial={availableRial}
          statusGroup={statusGroup}
          onStatusGroup={onStatusGroup}
        />
      ) : null}

      <Filters
        preset={preset}
        onPreset={onPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFrom={onCustomFrom}
        onCustomTo={onCustomTo}
        statusGroup={statusGroup}
        onStatusGroup={onStatusGroup}
        type={type}
        onType={onType}
        search={search}
        onSearch={onSearch}
        rows={rows}
      />

      {preset === 'custom' && !rangeReady ? (
        <p className="text-sm text-gray-500">تاریخ شروع و پایان بازه سفارشی را انتخاب کنید.</p>
      ) : null}

      {listError ? (
        <ErrorPanel message="پرداخت‌ها قابل دریافت نیست." onRetry={onRetryList} />
      ) : listLoading && payments.length === 0 ? (
        <ListSkeleton />
      ) : showOnboarding ? (
        <EmptyLedger />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-8 text-center shadow-sm">
          <p className="text-sm text-gray-800">در این بازه پرداختی با فیلترهای انتخاب‌شده نیست.</p>
        </div>
      ) : (
        <>
          <h2 className="text-base font-bold text-gray-900 lg:text-lg">جدول تراکنش‌های ریالی</h2>
          <PaymentCards rows={rows} />
          <PaymentTable rows={rows} />
          {meta ? (
            <PaymentPagination page={page} limit={limit} total={meta.total} onPage={onPage} onLimit={onLimit} />
          ) : null}
        </>
      )}

    </div>
  );
}

function toggleStatusGroup(current: '' | PaymentStatusGroup, next: PaymentStatusGroup): '' | PaymentStatusGroup {
  return current === next ? '' : next;
}

function SummaryCards({
  summary,
  availableRial,
  statusGroup,
  onStatusGroup,
}: {
  summary: PaymentSummary;
  availableRial?: string | null;
  statusGroup: '' | PaymentStatusGroup;
  onStatusGroup: (status: '' | PaymentStatusGroup) => void;
}) {
  const submitted = readSubmitted(summary);
  const unsuccessfulAmount = addAmounts(summary.failed.amountRial, summary.reversed.amountRial);
  const unsuccessfulCount = summary.failed.count + summary.reversed.count;
  const unsuccessfulSelected = statusGroup === 'failed' || statusGroup === 'reversed';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm">
        <p className="text-sm font-semibold text-emerald-800">موجودی ریالی کیف پول (قابل برداشت)</p>
        <p className="mt-3 text-lg font-bold text-emerald-950 lg:text-xl">
          {availableRial != null ? formatMoney(availableRial) : '—'}
        </p>
        <p className="mt-1 text-xs text-emerald-700/80">موجودی آزاد حساب شما</p>
      </article>

      <SummaryFilterCard
        title="در انتظار تأیید حسابداری"
        amount={submitted.amountRial}
        count={submitted.count}
        selected={statusGroup === 'submitted'}
        onSelect={() => onStatusGroup(toggleStatusGroup(statusGroup, 'submitted'))}
        tone="amber"
      />

      <SummaryFilterCard
        title="مجموع واریزهای موفق"
        amount={summary.successful.amountRial}
        count={summary.successful.count}
        selected={statusGroup === 'successful'}
        onSelect={() => onStatusGroup(toggleStatusGroup(statusGroup, 'successful'))}
        tone="green"
      />

      <SummaryFilterCard
        title="تراکنش‌های ناموفق / مسترد شده"
        amount={unsuccessfulAmount}
        count={unsuccessfulCount}
        selected={unsuccessfulSelected}
        onSelect={() => onStatusGroup(unsuccessfulSelected ? '' : 'failed')}
        tone="rose"
      />
    </div>
  );
}

function SummaryFilterCard({
  title,
  amount,
  count,
  selected,
  onSelect,
  tone,
}: {
  title: string;
  amount: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
  tone: 'amber' | 'green' | 'rose';
}) {
  const shell =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50/90 text-amber-900'
      : tone === 'green'
        ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
        : 'border-rose-200 bg-rose-50/80 text-rose-900';
  const hint =
    tone === 'amber' ? 'text-amber-700/80' : tone === 'green' ? 'text-emerald-700/80' : 'text-rose-700/80';

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`فیلتر ${title}`}
      onClick={onSelect}
      className={cn(
        'rounded-2xl border p-4 text-right shadow-sm transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600',
        shell,
        selected ? 'ring-2 ring-emerald-600 ring-offset-1' : '',
      )}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-3 text-lg font-bold lg:text-xl">{formatMoney(amount)}</p>
      <p className={cn('mt-1 text-xs', hint)}>{toPersianDigits(String(count))} تراکنش</p>
    </button>
  );
}

function Filters(props: {
  preset: ActivityRangePreset;
  onPreset: (preset: ActivityRangePreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFrom: (value: string) => void;
  onCustomTo: (value: string) => void;
  statusGroup: '' | PaymentStatusGroup;
  onStatusGroup: (status: '' | PaymentStatusGroup) => void;
  type: '' | PaymentLedgerType;
  onType: (type: '' | PaymentLedgerType) => void;
  search: string;
  onSearch: (value: string) => void;
  rows: Payment[];
}) {
  const [open, setOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState(props.statusGroup);
  const [draftType, setDraftType] = useState(props.type);
  const [draftPreset, setDraftPreset] = useState(props.preset);

  const openSheet = () => {
    setDraftStatus(props.statusGroup);
    setDraftType(props.type);
    setDraftPreset(props.preset);
    setOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 lg:hidden">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">جستجو</span>
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            value={props.search}
            onChange={(event) => props.onSearch(event.target.value)}
            placeholder="جستجو با کد رهگیری، شماره سفارش، مبلغ..."
            className={`${selectClass} pr-9`}
          />
        </label>
        <button
          type="button"
          onClick={openSheet}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          فیلترها
        </button>
        <ExportButton rows={props.rows} compact />
      </div>

      <div className="flex flex-wrap gap-2 lg:hidden">
        {PAYMENT_STATUS_CHIPS.map((chip) => {
          const active = props.statusGroup === chip.id;
          return (
            <button
              key={chip.label}
              type="button"
              aria-pressed={active}
              onClick={() => props.onStatusGroup(chip.id)}
              className={cn(
                'min-h-11 rounded-full border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600',
                active ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-800',
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="hidden items-end gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm lg:grid lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto]">
        <Field label="جستجو">
          <label className="relative block">
            <span className="sr-only">جستجو</span>
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              value={props.search}
              onChange={(event) => props.onSearch(event.target.value)}
              placeholder="جستجو با کد رهگیری، شماره سفارش، مبلغ..."
              className={`${selectClass} pr-9`}
            />
          </label>
        </Field>
        <Field label="نوع تراکنش">
          <select
            aria-label="نوع تراکنش"
            className={selectClass}
            value={props.type}
            onChange={(event) => props.onType(event.target.value as '' | PaymentLedgerType)}
          >
            {PAYMENT_TYPE_FILTERS.map((option) => (
              <option key={option.id || 'all'} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="وضعیت">
          <select
            aria-label="وضعیت"
            className={selectClass}
            value={props.statusGroup}
            onChange={(event) => props.onStatusGroup(event.target.value as '' | PaymentStatusGroup)}
          >
            {PAYMENT_STATUS_FILTERS_COMPACT.map((option) => (
              <option key={option.id || 'all'} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="بازه زمانی">
          <select
            aria-label="بازه زمانی"
            className={selectClass}
            value={props.preset}
            onChange={(event) => props.onPreset(event.target.value as ActivityRangePreset)}
          >
            {PAYMENT_RANGE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="pb-0.5">
          <ExportButton rows={props.rows} />
        </div>
      </div>

      {props.preset === 'custom' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DatePickerJalali label="از" value={props.customFrom} onChange={props.onCustomFrom} allowFuture={false} />
          <DatePickerJalali label="تا" value={props.customTo} onChange={props.onCustomTo} allowFuture={false} />
        </div>
      ) : null}

      <InboxSheet
        open={open}
        title="فیلتر پرداخت‌ها"
        onClose={() => setOpen(false)}
        footer={
          <button
            type="button"
            className="min-h-11 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            onClick={() => {
              props.onStatusGroup(draftStatus);
              props.onType(draftType);
              props.onPreset(draftPreset);
              setOpen(false);
            }}
          >
            اعمال فیلتر
          </button>
        }
      >
        <RadioGroup legend="وضعیت" name="payment-status" value={draftStatus} options={PAYMENT_STATUS_FILTERS} onChange={setDraftStatus} />
        <RadioGroup legend="نوع تراکنش" name="payment-type" value={draftType} options={PAYMENT_TYPE_FILTERS} onChange={setDraftType} />
        <RadioGroup legend="بازه زمانی" name="payment-range" value={draftPreset} options={PAYMENT_RANGE_OPTIONS} onChange={setDraftPreset} />
      </InboxSheet>
    </div>
  );
}

function ExportButton({ rows, compact }: { rows: Payment[]; compact?: boolean }) {
  const disabled = rows.length === 0;
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? 'ردیفی برای خروجی نیست' : 'دریافت گزارش اکسل'}
      aria-label="دریافت گزارش اکسل"
      onClick={() => downloadPaymentsCsv(rows)}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-40',
        compact ? 'w-11 px-0' : 'px-3',
      )}
    >
      {compact ? <Download className="h-4 w-4" aria-hidden /> : <FileSpreadsheet className="h-4 w-4" aria-hidden />}
      {compact ? null : <span>دریافت خروجی اکسل</span>}
    </button>
  );
}

function downloadPaymentsCsv(rows: Payment[]) {
  const header = ['کد رهگیری', 'تاریخ', 'نوع و روش', 'شماره سفارش', 'مبلغ ریال', 'وضعیت'];
  const lines = rows.map((payment) =>
    [
      paymentTrackingCode(payment),
      paymentStamp(payment.createdAt),
      paymentTypeMethodLabel(payment, PAYMENT_METHOD_LABELS),
      payment.orderNumber ?? '',
      payment.amount,
      paymentStatusLabel(payment.status),
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(','),
  );
  const csv = `\uFEFF${[header.join(','), ...lines].join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'payments.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 text-xs text-gray-500">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function RadioGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="mb-4">
      <legend className="mb-2 text-sm font-bold text-gray-900">{legend}</legend>
      <div className="space-y-2">
        {options.map((option) => (
          <label key={`${name}-${option.label}`} className="flex min-h-11 items-center gap-2 text-sm text-gray-800">
            <input
              type="radio"
              name={name}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
              className="h-4 w-4 accent-emerald-600"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function PaymentCards({ rows }: { rows: Payment[] }) {
  return (
    <ul className="space-y-3 lg:hidden">
      {rows.map((payment) => {
        const pending = payment.status === 'PENDING';
        return (
          <li key={payment.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <CopyTrackingCode payment={payment} />
              <PaymentStatusBadge status={payment.status} />
            </div>
            <p className="mt-3 text-sm text-gray-600">{paymentTypeMethodLabel(payment, PAYMENT_METHOD_LABELS)}</p>
            <p className="mt-2 text-base font-bold text-gray-900">{formatMoney(payment.amount)}</p>
            <p className="mt-1 text-xs text-gray-500">{paymentStamp(payment.createdAt)}</p>
            {payment.orderId && payment.orderNumber ? (
              <Link
                href={`/portal/orders/${payment.orderId}`}
                className="mt-2 inline-block text-sm font-semibold text-emerald-700 underline underline-offset-2"
              >
                {toPersianDigits(payment.orderNumber)}
              </Link>
            ) : (
              <p className="mt-2 text-xs text-gray-500">{relatedPaymentLabel(payment)}</p>
            )}
            <div className="mt-3 flex justify-end">
              <Link
                href={`/portal/payments/${payment.id}`}
                className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                {pending ? 'ویرایش فیش' : 'مشاهده رسید'}
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PaymentTable({ rows }: { rows: Payment[] }) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:block">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            {['کد رهگیری', 'تاریخ و ساعت', 'نوع و روش پرداخت', 'شماره سفارش', 'مبلغ', 'وضعیت', 'عملیات'].map(
              (heading) => (
                <th key={heading} scope="col" className="px-3 py-3 text-right text-xs font-medium">
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((payment) => {
            const pending = payment.status === 'PENDING';
            return (
              <tr key={payment.id} className="border-t border-gray-100">
                <td className="px-3 py-4">
                  <CopyTrackingCode payment={payment} />
                </td>
                <td className="px-3 py-4 text-xs text-gray-500">{paymentStamp(payment.createdAt)}</td>
                <td className="px-3 py-4 text-xs text-gray-800">
                  {paymentTypeMethodLabel(payment, PAYMENT_METHOD_LABELS)}
                </td>
                <td className="truncate px-3 py-4 text-xs font-semibold" dir="ltr">
                  {payment.orderId && payment.orderNumber ? (
                    <Link
                      href={`/portal/orders/${payment.orderId}`}
                      className="text-emerald-700 underline underline-offset-2"
                    >
                      {payment.orderNumber}
                    </Link>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-4 text-sm font-bold text-gray-900">{formatMoney(payment.amount)}</td>
                <td className="px-3 py-4">
                  <PaymentStatusBadge status={payment.status} />
                </td>
                <td className="px-3 py-4">
                  <Link
                    href={`/portal/payments/${payment.id}`}
                    className="inline-flex min-h-11 items-center rounded-xl px-2 text-sm font-semibold text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  >
                    {pending ? 'ویرایش فیش' : 'مشاهده رسید'}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CopyTrackingCode({ payment }: { payment: Payment }) {
  const [copied, setCopied] = useState(false);
  const code = paymentTrackingCode(payment);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="inline-flex max-w-full items-center gap-1.5" dir="ltr">
      <span className="truncate text-xs font-semibold text-gray-900" title={code}>
        {code}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        title={copied ? 'کپی شد' : 'کپی کد رهگیری'}
        aria-label={copied ? 'کپی شد' : 'کپی کد رهگیری'}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </div>
  );
}

function PaymentPagination({
  page,
  limit,
  total,
  onPage,
  onLimit,
}: {
  page: number;
  limit: number;
  total: number;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-gray-500">
        نمایش {toPersianDigits(String(from))} تا {toPersianDigits(String(to))} از {toPersianDigits(String(total))} پرداخت
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-gray-500">
          نمایش در هر صفحه
          <select
            aria-label="تعداد در هر صفحه"
            value={limit}
            onChange={(event) => onLimit(Number(event.target.value))}
            className="min-h-11 rounded-xl border border-gray-300 bg-white px-2 text-sm text-gray-800"
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {toPersianDigits(String(size))}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm disabled:opacity-40 lg:hidden"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          قبلی
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm disabled:opacity-40 lg:hidden"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          پرداخت‌های بیشتر
        </button>
        <div className="hidden items-center gap-1 lg:flex">
          <PageButton label="صفحه قبل" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            ‹
          </PageButton>
          {pageWindow(page, totalPages).map((item, index) =>
            item === '…' ? (
              <span key={`gap-${index}`} className="px-1 text-gray-400">
                …
              </span>
            ) : (
              <PageButton key={item} label={`صفحه ${toPersianDigits(String(item))}`} pressed={item === page} onClick={() => onPage(item)}>
                {toPersianDigits(String(item))}
              </PageButton>
            ),
          )}
          <PageButton label="صفحه بعد" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
            ›
          </PageButton>
        </div>
      </div>
    </div>
  );
}

function pageWindow(page: number, totalPages: number): Array<number | '…'> {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const items: Array<number | '…'> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) items.push('…');
  for (let current = start; current <= end; current += 1) items.push(current);
  if (end < totalPages - 1) items.push('…');
  items.push(totalPages);
  return items;
}

function PageButton({
  children,
  label,
  pressed,
  disabled,
  onClick,
}: {
  children: ReactNode;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={pressed ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-11 min-w-11 items-center justify-center rounded-xl border px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-40',
        pressed ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-800',
      )}
    >
      {children}
    </button>
  );
}

function EmptyLedger() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-10 text-center shadow-sm">
      <WalletCards className="mx-auto h-8 w-8 text-emerald-600" aria-hidden />
      <h2 className="mt-3 text-base font-bold text-gray-900">هنوز تراکنش ریالی ثبت نشده است</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-gray-500">
        با «افزایش اعتبار» اولین واریز را ثبت کنید؛ سوابق پس از ثبت در همین صفحه نمایش داده می‌شود.
      </p>
      <div className="mt-4 flex justify-center">
        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          از دکمه بالای صفحه شروع کنید
        </span>
      </div>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center" role="alert">
      <p className="text-sm font-semibold text-red-600">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        تلاش مجدد
      </button>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-2xl bg-white" />
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-2xl bg-white lg:h-12" />
      ))}
    </div>
  );
}
