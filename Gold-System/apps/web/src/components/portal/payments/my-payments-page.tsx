'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  CircleCheck,
  CircleX,
  Clock3,
  CreditCard,
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
  PAYMENT_TYPE_FILTERS,
  paymentStamp,
  paymentStatusLabel,
  paymentTone,
  paymentTypeLabel,
  relatedPaymentLabel,
  type PaymentTone,
} from '@/lib/payment-display';
import { DatePickerJalali } from '@/components/ui/date-picker-jalali';
import { InboxSheet } from '@/components/portal/notifications/inbox-sheet';
import { SubmitReceiptButton } from '@/components/portal/payments/submit-receipt-sheet';
import { PAYMENT_METHOD_LABELS, cn, formatMoney, toPersianDigits } from '@/lib/utils';

const selectClass =
  'min-h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#202124] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]';

const toneClass: Record<PaymentTone, string> = {
  green: 'bg-green-50 text-[#16A34A]',
  red: 'bg-red-50 text-[#DC2626]',
  blue: 'bg-blue-50 text-[#2563EB]',
  orange: 'bg-amber-50 text-[#D97706]',
  muted: 'bg-slate-100 text-[#6B7280]',
};

function StatusIcon({ status }: { status: string }) {
  const tone = paymentTone(status);
  const Icon: LucideIcon =
    tone === 'green' ? CircleCheck : tone === 'red' ? CircleX : tone === 'blue' ? RefreshCcw : tone === 'orange' ? Clock3 : WalletCards;
  return <Icon className="h-4 w-4 shrink-0" aria-hidden />;
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
}) {
  const filtersActive = Boolean(statusGroup || type || search.trim());
  const rows = payments;
  const showOnboarding = Boolean(summary && !summary.hasAny && !filtersActive && (meta?.total ?? 0) === 0);

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-4 overflow-x-hidden">
      <header className="hidden lg:block">
        <h1 className="text-[26px] font-bold text-[#202124]">پرداخت‌های من</h1>
        <p className="mt-1 max-w-2xl text-sm leading-7 text-[#6B7280]">
          مشاهده و پیگیری تمام پرداخت‌های مربوط به سفارش‌ها و معاملات شما
        </p>
      </header>
      <div className="flex justify-end">
        <SubmitReceiptButton onSubmitted={onReceiptSubmitted} />
      </div>

      {summaryError ? (
        <ErrorPanel message="پرداخت‌ها قابل دریافت نیست." onRetry={onRetrySummary} />
      ) : summaryLoading && !summary ? (
        <SummarySkeleton />
      ) : summary ? (
        <SummaryCards summary={summary} />
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
      />

      {preset === 'custom' && !rangeReady ? (
        <p className="text-sm text-[#6B7280]">تاریخ شروع و پایان بازه سفارشی را انتخاب کنید.</p>
      ) : null}

      {listError ? (
        <ErrorPanel message="پرداخت‌ها قابل دریافت نیست." onRetry={onRetryList} />
      ) : listLoading && payments.length === 0 ? (
        <ListSkeleton />
      ) : showOnboarding ? (
        <EmptyLedger />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-8 text-center">
          <p className="text-sm text-[#202124]">در این بازه پرداختی با فیلترهای انتخاب‌شده نیست.</p>
        </div>
      ) : (
        <>
          <h2 className="text-base font-bold text-[#202124] lg:text-lg">آخرین پرداخت‌ها</h2>
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

function SummaryCards({ summary }: { summary: PaymentSummary }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 lg:hidden">
        <CompactCard title="مجموع پرداختی" value={formatMoney(summary.totalPaid.amountRial)} hint={`${toPersianDigits(String(summary.totalPaid.count))} پرداخت`} />
        <CompactCard title="موفق" value={toPersianDigits(String(summary.successful.count))} hint={formatMoney(summary.successful.amountRial)} tone="green" />
        <CompactCard title="ناموفق" value={toPersianDigits(String(summary.failed.count))} hint={formatMoney(summary.failed.amountRial)} tone="red" />
        <CompactCard title="برگشتی" value={toPersianDigits(String(summary.reversed.count))} hint={formatMoney(summary.reversed.amountRial)} tone="blue" />
      </div>
      <div className="hidden gap-3 lg:grid lg:grid-cols-4">
        <article className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-[#6B7280]">
            <WalletCards className="h-4 w-4 text-[#C8922E]" aria-hidden />
            مجموع پرداختی
          </div>
          <p className="mt-3 text-lg font-bold tabular-nums text-[#202124]">{formatMoney(summary.totalPaid.amountRial)}</p>
          <p className="mt-1 text-xs text-[#6B7280]">در {toPersianDigits(String(summary.totalPaid.count))} پرداخت</p>
        </article>
        <SummaryStat
          title="پرداخت‌های موفق"
          count={summary.successful.count}
          amount={summary.successful.amountRial}
          tone="green"
        />
        <SummaryStat
          title="پرداخت‌های ناموفق"
          count={summary.failed.count}
          amount={summary.failed.amountRial}
          tone="red"
        />
        <SummaryStat title="مبالغ برگشتی" count={summary.reversed.count} amount={summary.reversed.amountRial} tone="blue" />
      </div>
    </>
  );
}

function CompactCard({
  title,
  value,
  hint,
  tone = 'muted',
}: {
  title: string;
  value: string;
  hint: string;
  tone?: PaymentTone;
}) {
  return (
    <article className="min-w-0 rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-sm">
      <p className={cn('text-xs font-semibold', tone === 'muted' ? 'text-[#6B7280]' : toneClass[tone])}>{title}</p>
      <p className="mt-1 break-words text-sm font-bold tabular-nums text-[#202124]">{value}</p>
      <p className="mt-1 break-words text-[11px] leading-5 text-[#6B7280]">{hint}</p>
    </article>
  );
}

function SummaryStat({
  title,
  count,
  amount,
  tone,
}: {
  title: string;
  count: number;
  amount: string;
  tone: PaymentTone;
}) {
  return (
    <article className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <p className={cn('text-sm font-semibold', toneClass[tone].split(' ').at(-1))}>{title}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-[#202124]">{toPersianDigits(String(count))}</p>
      <p className="mt-1 text-xs text-[#6B7280]">مجموع مبلغ</p>
      <p className="text-sm font-semibold tabular-nums text-[#202124]">{formatMoney(amount)}</p>
    </article>
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
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" aria-hidden />
          <input
            value={props.search}
            onChange={(event) => props.onSearch(event.target.value)}
            placeholder="جستجو در شماره پرداخت، شماره سفارش..."
            className={`${selectClass} pr-9`}
          />
        </label>
        <button
          type="button"
          onClick={openSheet}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#202124] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          فیلترها
        </button>
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
                'min-h-11 rounded-full border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]',
                active ? 'border-[#C8922E] bg-[#FFF4D6] text-[#C8922E]' : 'border-[#E5E7EB] bg-white text-[#202124]',
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="hidden gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-3 lg:grid lg:grid-cols-4">
        <Field label="بازه زمانی">
          <select aria-label="بازه زمانی" className={selectClass} value={props.preset} onChange={(event) => props.onPreset(event.target.value as ActivityRangePreset)}>
            {PAYMENT_RANGE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="نوع پرداخت">
          <select aria-label="نوع پرداخت" className={selectClass} value={props.type} onChange={(event) => props.onType(event.target.value as '' | PaymentLedgerType)}>
            {PAYMENT_TYPE_FILTERS.map((option) => (
              <option key={option.id || 'all'} value={option.id}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="وضعیت پرداخت">
          <select aria-label="وضعیت پرداخت" className={selectClass} value={props.statusGroup} onChange={(event) => props.onStatusGroup(event.target.value as '' | PaymentStatusGroup)}>
            {PAYMENT_STATUS_FILTERS.map((option) => (
              <option key={option.id || 'all'} value={option.id}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="جستجو">
          <label className="relative block">
            <span className="sr-only">جستجو</span>
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" aria-hidden />
            <input
              value={props.search}
              onChange={(event) => props.onSearch(event.target.value)}
              placeholder="جستجو در شماره پرداخت، شماره سفارش..."
              className={`${selectClass} pr-9`}
            />
          </label>
        </Field>
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
            className="min-h-11 w-full rounded-xl bg-[#F59E0B] text-sm font-bold text-[#202124] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]"
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
        <RadioGroup legend="وضعیت" name="payment-status" value={draftStatus} options={PAYMENT_STATUS_CHIPS} onChange={setDraftStatus} />
        <RadioGroup legend="نوع پرداخت" name="payment-type" value={draftType} options={PAYMENT_TYPE_FILTERS} onChange={setDraftType} />
        <RadioGroup legend="بازه زمانی" name="payment-range" value={draftPreset} options={PAYMENT_RANGE_OPTIONS} onChange={setDraftPreset} />
      </InboxSheet>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 text-xs text-[#6B7280]">
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
      <legend className="mb-2 text-sm font-bold text-[#202124]">{legend}</legend>
      <div className="space-y-2">
        {options.map((option) => (
          <label key={`${name}-${option.label}`} className="flex min-h-11 items-center gap-2 text-sm text-[#202124]">
            <input
              type="radio"
              name={name}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
              className="h-4 w-4 accent-[#C8922E]"
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
      {rows.map((payment) => (
        <li key={payment.id}>
          <Link
            href={`/portal/payments/${payment.id}`}
            className="block rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]"
            aria-label={`جزئیات ${paymentTypeLabel(payment.relatedSide)} ${relatedPaymentLabel(payment)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className={cn('inline-flex items-center gap-2 text-sm font-bold', toneClass[paymentTone(payment.status)])}>
                <StatusIcon status={payment.status} />
                {paymentTypeLabel(payment.relatedSide)}
              </span>
              <ChevronLeft className="h-4 w-4 text-[#6B7280]" aria-hidden />
            </div>
            <p className="mt-3 text-sm font-semibold text-[#202124]" dir="ltr">
              {relatedPaymentLabel(payment)}
            </p>
            <p className="mt-1 text-base font-bold tabular-nums text-[#202124]">{formatMoney(payment.amount)}</p>
            <p className="mt-3 inline-flex items-center gap-1 text-xs text-[#6B7280]">
              <CreditCard className="h-3.5 w-3.5" aria-hidden />
              {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
            </p>
            <p className="mt-1 text-xs text-[#6B7280]">{paymentStamp(payment.createdAt)}</p>
            <div className="mt-3 flex justify-end">
              <PaymentStatusBadge status={payment.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PaymentTable({ rows }: { rows: Payment[] }) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm lg:block">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-[#F8F9FA] text-[#6B7280]">
          <tr>
            {['شماره پرداخت', 'تاریخ و ساعت', 'مرتبط با', 'نوع پرداخت', 'روش پرداخت', 'مبلغ', 'وضعیت', 'عملیات'].map(
              (heading) => (
                <th key={heading} scope="col" className="px-2 py-3 text-right text-xs font-medium">
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((payment) => (
            <tr key={payment.id} className="border-t border-[#E5E7EB]">
              <td className="truncate px-2 py-4 text-xs font-semibold" dir="ltr" title={payment.id}>
                {payment.id}
              </td>
              <td className="px-2 py-4 text-xs text-[#6B7280]">{paymentStamp(payment.createdAt)}</td>
              <td className="truncate px-2 py-4 text-xs font-semibold" dir="ltr">
                {relatedPaymentLabel(payment)}
              </td>
              <td className="px-2 py-4 text-xs">{paymentTypeLabel(payment.relatedSide)}</td>
              <td className="px-2 py-4 text-xs">{PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}</td>
              <td className="px-2 py-4 text-xs font-semibold tabular-nums">{formatMoney(payment.amount)}</td>
              <td className="px-2 py-4">
                <PaymentStatusBadge status={payment.status} />
              </td>
              <td className="px-2 py-4">
                <Link
                  href={`/portal/payments/${payment.id}`}
                  className="inline-flex min-h-11 items-center rounded-xl px-2 text-sm font-semibold text-[#C8922E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]"
                >
                  جزئیات
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <p className="text-sm text-[#6B7280]">
        نمایش {toPersianDigits(String(from))} تا {toPersianDigits(String(to))} از {toPersianDigits(String(total))} پرداخت
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-[#6B7280]">
          نمایش در هر صفحه
          <select
            aria-label="تعداد در هر صفحه"
            value={limit}
            onChange={(event) => onLimit(Number(event.target.value))}
            className="min-h-11 rounded-xl border border-[#E5E7EB] bg-white px-2 text-sm text-[#202124]"
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
          className="min-h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm disabled:opacity-40 lg:hidden"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          قبلی
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm disabled:opacity-40 lg:hidden"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          پرداخت‌های بیشتر
        </button>
        <div className="hidden items-center gap-1 lg:flex">
          <PageButton label="صفحه قبل" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</PageButton>
          {pageWindow(page, totalPages).map((item, index) =>
            item === '…' ? (
              <span key={`gap-${index}`} className="px-1 text-[#6B7280]">…</span>
            ) : (
              <PageButton key={item} label={`صفحه ${item}`} pressed={item === page} onClick={() => onPage(item)}>
                {toPersianDigits(String(item))}
              </PageButton>
            ),
          )}
          <PageButton label="صفحه بعد" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>›</PageButton>
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
        'inline-flex h-11 min-w-11 items-center justify-center rounded-xl border px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E] disabled:opacity-40',
        pressed ? 'border-[#C8922E] bg-[#FFF4D6] text-[#C8922E]' : 'border-[#E5E7EB] bg-white text-[#202124]',
      )}
    >
      {children}
    </button>
  );
}

function EmptyLedger() {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-10 text-center">
      <WalletCards className="mx-auto h-8 w-8 text-[#C8922E]" aria-hidden />
      <h2 className="mt-3 text-base font-bold text-[#202124]">هنوز پرداختی ثبت نشده است</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-[#6B7280]">
        سوابق پرداخت‌های شما پس از انجام تراکنش در اینجا نمایش داده می‌شود.
      </p>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center" role="alert">
      <p className="text-sm font-semibold text-[#DC2626]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-[#202124] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]"
      >
        تلاش مجدد
      </button>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-2xl bg-white" />
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
