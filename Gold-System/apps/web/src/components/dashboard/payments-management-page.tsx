'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Plus,
  Search,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import {
  internalCustomersApi,
  internalPaymentsApi,
  type StaffPayment,
} from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { ForbiddenNotice, PermissionGate } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { PaymentDetailModal } from '@/components/dashboard/payment-detail-modal';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MobileNumber } from '@/components/ui/mobile-input';
import { ApiClientError } from '@/lib/api';
import { tomanAmountWordsLabel } from '@/lib/toman-words';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  cn,
  formatDateTime,
  formatFaNumber,
  formatGroupedPersianInteger,
  formatMobile,
  formatMoney,
  statusLabel,
  toLatinDigits,
  tomanToRial,
  toPersianDigits,
} from '@/lib/utils';

const LIMIT = 20;
const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const RECEIPT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

const fieldClass =
  'mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500';

type DrawerTab = 'wallet' | 'trade';
type ConfirmAction = { type: 'validate' | 'fail'; payment: StaffPayment } | null;

type Filters = {
  q: string;
  statusGroup: string;
  method: string;
  customerId: string;
};

const emptyFilters: Filters = { q: '', statusGroup: '', method: '', customerId: '' };

function paymentPurpose(row: StaffPayment): string {
  if (row.orderNumber) return `سفارش #${toPersianDigits(row.orderNumber)}`;
  if (row.tradeNumber) return `معامله #${toPersianDigits(row.tradeNumber)}`;
  if (row.tradeId) return 'تسویه معامله';
  return 'افزایش اعتبار';
}

function shortPaymentId(id: string): string {
  const compact = id.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `#${toPersianDigits(compact)}`;
}

function softStatusClass(status: string): string {
  if (status === 'PENDING') return 'bg-amber-50 text-amber-800 border-amber-200';
  if (status === 'FAILED' || status === 'REVERSED') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (['VALIDATED', 'ALLOCATED', 'COMPLETED'].includes(status)) {
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
  return '';
}

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${toPersianDigits(String(bytes))} B`;
  if (bytes < 1024 * 1024) return `${toPersianDigits((bytes / 1024).toFixed(1))} KB`;
  return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1))} MB`;
}

export function PaymentsManagementPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, ['payment.read', 'payment.create']);
  const canValidate = hasPermission(user?.permissions, 'payment.validate');
  const canCreate = hasPermission(user?.permissions, 'payment.create');

  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [presetCustomerId, setPresetCustomerId] = useState<string | null>(null);
  const [detailPayment, setDetailPayment] = useState<StaffPayment | null>(null);

  useEffect(() => {
    const customerId = new URLSearchParams(window.location.search).get('customerId') ?? '';
    if (!customerId) return;
    setDraft((current) => ({ ...current, customerId }));
    setApplied((current) => ({ ...current, customerId }));
    setPresetCustomerId(customerId);
  }, []);

  const listKey = allowed ? ['payments', applied, page] : null;
  const { data, error, isLoading, mutate } = useSWR(listKey, () =>
    internalPaymentsApi.list({
      q: applied.q || undefined,
      statusGroup: applied.statusGroup || undefined,
      method: applied.method || undefined,
      customerId: applied.customerId || undefined,
      limit: LIMIT,
      offset: (page - 1) * LIMIT,
    }),
  );

  const summary = useSWR(allowed ? 'payments-staff-summary' : null, () =>
    internalPaymentsApi.staffSummary(),
  );

  const refresh = useCallback(() => {
    void mutate();
    void summary.mutate();
  }, [mutate, summary]);

  const runConfirm = async () => {
    if (!confirm) return;
    setActionBusy(true);
    setActionError(null);
    try {
      if (confirm.type === 'validate') await internalPaymentsApi.validate(confirm.payment.id);
      else await internalPaymentsApi.fail(confirm.payment.id);
      setFeedback(confirm.type === 'validate' ? 'پرداخت تأیید شد.' : 'پرداخت رد شد.');
      setConfirm(null);
      setDetailPayment(null);
      refresh();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'عملیات انجام نشد.');
    } finally {
      setActionBusy(false);
    }
  };

  const exportExcel = async () => {
    const rows = data?.data ?? [];
    if (!rows.length) {
      setFeedback('ردیفی برای خروجی وجود ندارد.');
      return;
    }
    const xlsx = await import('xlsx');
    const sheet = xlsx.utils.json_to_sheet(
      rows.map((row) => ({
        شناسه: row.id,
        مشتری: row.customerName ?? row.customerId,
        موبایل: row.customerMobile ?? '',
        مبلغ_ریال: row.amount,
        بابت: paymentPurpose(row),
        روش: statusLabel(PAYMENT_METHOD_LABELS, row.method),
        ارجاع: row.referenceNumber ?? '',
        وضعیت: statusLabel(PAYMENT_STATUS_LABELS, row.status),
        تاریخ: row.createdAt,
      })),
    );
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book, sheet, 'payments');
    xlsx.writeFile(book, 'payments.xlsx');
  };

  const columns: Column<StaffPayment>[] = useMemo(
    () => [
      {
        key: 'id',
        header: 'شناسه پرداخت',
        render: (row) => (
          <span className="font-mono text-xs font-semibold text-slate-700" dir="ltr">
            {shortPaymentId(row.id)}
          </span>
        ),
      },
      {
        key: 'customer',
        header: 'مشتری',
        render: (row) => (
          <div className="min-w-[8rem]">
            <Link
              href={`/dashboard/customers/${row.customerId}`}
              className="font-medium text-slate-900 hover:text-emerald-700"
            >
              {row.customerName ?? 'مشتری'}
            </Link>
            {row.customerMobile ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                <MobileNumber value={row.customerMobile} />
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'amount',
        header: 'مبلغ',
        render: (row) => <span className="font-bold tabular-nums text-slate-900">{formatMoney(row.amount)}</span>,
      },
      {
        key: 'purpose',
        header: 'بابت',
        render: (row) => <span className="text-slate-700">{paymentPurpose(row)}</span>,
      },
      {
        key: 'method',
        header: 'روش پرداخت',
        render: (row) => statusLabel(PAYMENT_METHOD_LABELS, row.method),
      },
      {
        key: 'ref',
        header: 'شماره ارجاع',
        render: (row) =>
          row.referenceNumber ? (
            <span dir="ltr" className="font-mono text-xs">
              {toPersianDigits(row.referenceNumber)}
            </span>
          ) : (
            '—'
          ),
      },
      {
        key: 'date',
        header: 'تاریخ و ساعت',
        render: (row) => (
          <span className="whitespace-nowrap text-xs text-slate-600">{formatDateTime(row.createdAt)}</span>
        ),
      },
      {
        key: 'status',
        header: 'وضعیت',
        render: (row) => (
          <StatusBadge
            status={row.status}
            label={statusLabel(PAYMENT_STATUS_LABELS, row.status)}
            className={softStatusClass(row.status)}
          />
        ),
      },
      {
        key: 'actions',
        header: 'عملیات',
        render: (row) => (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="مشاهده جزئیات"
              title="مشاهده جزئیات"
              onClick={() => setDetailPayment(row)}
            >
              <Eye className="h-4 w-4" />
            </button>
            {canValidate && row.status === 'PENDING' ? (
              <>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50"
                  aria-label="تأیید پرداخت"
                  title="تأیید پرداخت"
                  onClick={() => setConfirm({ type: 'validate', payment: row })}
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"
                  aria-label="رد پرداخت"
                  title="رد پرداخت"
                  onClick={() => setConfirm({ type: 'fail', payment: row })}
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : null}
          </div>
        ),
      },
    ],
    [canValidate],
  );

  if (!allowed) return <ForbiddenNotice permission="payment.read" />;

  const pendingCount = summary.data?.pendingCount ?? 0;
  const todayAmount = summary.data?.todayValidatedAmountRial ?? '0';
  const totalAmount = summary.data?.totalSuccessfulAmountRial ?? '0';

  return (
    <div className="space-y-5">
      <PageHeader
        title="مدیریت پرداخت‌ها و فیش‌ها"
        description="مشاهده پرداخت‌های آنلاین و حضوری، تأیید فیش‌ها و ثبت واریز جدید."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void exportExcel()}>
              <Download className="ml-1.5 h-4 w-4" aria-hidden />
              خروجی Excel
            </Button>
            <PermissionGate anyOf="payment.create">
              <Button
                size="sm"
                onClick={() => {
                  setDrawerOpen(true);
                  setFeedback(null);
                }}
              >
                <Plus className="ml-1.5 h-4 w-4" aria-hidden />
                ثبت پرداخت جدید
              </Button>
            </PermissionGate>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => {
            setDraft((c) => ({ ...c, statusGroup: 'submitted' }));
            setApplied((c) => ({ ...c, statusGroup: 'submitted' }));
            setPage(1);
          }}
          className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-right transition hover:border-amber-300"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-amber-900">در انتظار تایید</p>
            <Clock3 className="h-5 w-5 text-amber-600" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-amber-950">
            {formatFaNumber(pendingCount)} مورد
          </p>
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft((c) => ({ ...c, statusGroup: 'successful' }));
            setApplied((c) => ({ ...c, statusGroup: 'successful' }));
            setPage(1);
          }}
          className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-right transition hover:border-emerald-300"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-emerald-900">واریزی‌های تایید شده امروز</p>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
          </div>
          <p className="mt-2 text-xl font-bold tabular-nums text-emerald-950">{formatMoney(todayAmount)}</p>
        </button>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-600">کل واریزی‌های سیستم</p>
            <Wallet className="h-5 w-5 text-slate-400" aria-hidden />
          </div>
          <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">{formatMoney(totalAmount)}</p>
        </div>
      </div>

      <form
        className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-[1fr_auto_auto_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(draft);
          setPage(1);
        }}
      >
        <label className="relative block text-sm">
          <span className="sr-only">جستجو</span>
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-10 w-full rounded-lg border border-input bg-background pr-10 pl-3 text-sm"
            placeholder="جستجو بر اساس نام، موبایل، شناسه تراکنش یا کد ارجاع..."
            value={draft.q}
            onChange={(event) => setDraft((c) => ({ ...c, q: event.target.value }))}
          />
        </label>
        <label className="text-sm">
          <span className="sr-only">وضعیت</span>
          <select
            className="h-10 w-full min-w-[10rem] rounded-lg border border-input bg-background px-3 text-sm"
            value={draft.statusGroup}
            onChange={(event) => setDraft((c) => ({ ...c, statusGroup: event.target.value }))}
            aria-label="وضعیت"
          >
            <option value="">وضعیت (همه)</option>
            <option value="successful">تایید شده</option>
            <option value="submitted">در انتظار</option>
            <option value="failed">ناموفق</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="sr-only">روش پرداخت</span>
          <select
            className="h-10 w-full min-w-[10rem] rounded-lg border border-input bg-background px-3 text-sm"
            value={draft.method}
            onChange={(event) => setDraft((c) => ({ ...c, method: event.target.value }))}
            aria-label="روش پرداخت"
          >
            <option value="">روش پرداخت (همه)</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          اعمال فیلتر
        </Button>
      </form>

      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {actionError ? <Alert variant="error">{actionError}</Alert> : null}
      {error ? <ApiErrorState error={error} onRetry={() => void mutate()} /> : null}

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        isLoading={isLoading}
        emptyMessage="پرداختی یافت نشد"
        page={page}
        totalPages={data?.meta.totalPages}
        total={data?.meta.total}
        pageSize={LIMIT}
        onPageChange={setPage}
      />

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.type === 'fail' ? 'رد پرداخت' : 'تأیید پرداخت'}
        message={
          confirm?.type === 'fail'
            ? 'این پرداخت به‌عنوان ناموفق ثبت می‌شود و اعتبار مشتری افزایش نمی‌یابد.'
            : confirm?.payment.tradeId
              ? 'وضعیت پرداخت به تأییدشده تغییر می‌کند.'
              : 'پس از تأیید، اعتبار مشتری به اندازه مبلغ این واریز افزایش می‌یابد.'
        }
        confirmLabel={confirm?.type === 'fail' ? 'رد پرداخت' : 'تأیید پرداخت'}
        destructive={confirm?.type === 'fail'}
        isLoading={actionBusy}
        onClose={() => setConfirm(null)}
        onConfirm={() => void runConfirm()}
      />

      {detailPayment ? (
        <PaymentDetailModal
          payment={detailPayment}
          canValidate={canValidate}
          onClose={() => setDetailPayment(null)}
          onApprove={() => setConfirm({ type: 'validate', payment: detailPayment })}
          onReject={() => setConfirm({ type: 'fail', payment: detailPayment })}
          onEdit={() => {
            setPresetCustomerId(detailPayment.customerId);
            setDetailPayment(null);
            if (canCreate) setDrawerOpen(true);
          }}
        />
      ) : null}

      {canCreate ? (
        <NewPaymentDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          canValidate={canValidate}
          presetCustomerId={presetCustomerId}
          onRecorded={(message) => {
            setFeedback(message);
            setDrawerOpen(false);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function NewPaymentDrawer({
  open,
  onClose,
  canValidate,
  presetCustomerId,
  onRecorded,
}: {
  open: boolean;
  onClose: () => void;
  canValidate: boolean;
  presetCustomerId: string | null;
  onRecorded: (message: string) => void;
}) {
  const [tab, setTab] = useState<DrawerTab>('wallet');
  const [customerId, setCustomerId] = useState('');
  const [customerOptions, setCustomerOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{ value: string; label: string } | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [tradeId, setTradeId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const wordsLabel = useMemo(
    () => tomanAmountWordsLabel(toLatinDigits(amount).replace(/\D/g, '')),
    [amount],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTab('wallet');
    setMethod('BANK_TRANSFER');
    setAmount('');
    setReference('');
    setNotes('');
    setTradeId('');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!presetCustomerId) {
      setCustomerId('');
      setSelectedCustomer(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const customer = await internalCustomersApi.getById(presetCustomerId);
        if (cancelled) return;
        const option = {
          value: customer.id,
          label: `${customer.fullName} — ${formatMobile(customer.mobile)}`,
        };
        setCustomerId(customer.id);
        setSelectedCustomer(option);
        setCustomerOptions([option]);
      } catch {
        if (!cancelled) {
          setCustomerId(presetCustomerId);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, presetCustomerId]);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    if (typeof URL.createObjectURL !== 'function') {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const searchCustomers = useCallback(async (query: string) => {
    setCustomerLoading(true);
    try {
      const result = await internalCustomersApi.list({
        search: toLatinDigits(query.trim()) || undefined,
        limit: 20,
        page: 1,
      });
      setCustomerOptions(
        result.items.map((item) => ({
          value: item.id,
          label: `${item.fullName} — ${formatMobile(item.mobile)}`,
        })),
      );
    } catch {
      setCustomerOptions([]);
    } finally {
      setCustomerLoading(false);
    }
  }, []);

  const applyFile = (candidate: File | undefined) => {
    if (!candidate) return;
    if (!RECEIPT_TYPES.has(candidate.type)) {
      setError('فقط تصویر JPG، PNG، WebP یا PDF پذیرفته می‌شود.');
      return;
    }
    if (candidate.size > MAX_RECEIPT_BYTES) {
      setError('حجم رسید نباید بیشتر از ۱۰ مگابایت باشد.');
      return;
    }
    setError(null);
    setFile(candidate);
  };

  const mergedCustomers =
    selectedCustomer && !customerOptions.some((opt) => opt.value === selectedCustomer.value)
      ? [selectedCustomer, ...customerOptions]
      : customerOptions;

  const submit = async () => {
    setError(null);
    if (tab === 'wallet' && !customerId) {
      setError('مشتری را انتخاب کنید.');
      return;
    }
    if (tab === 'trade' && !tradeId.trim()) {
      setError('شناسه معامله را وارد کنید.');
      return;
    }
    const rialAmount = tomanToRial(toLatinDigits(amount).replace(/[^\d.]/g, ''));
    if (!rialAmount) {
      setError('مبلغ را وارد کنید.');
      return;
    }
    if (method !== 'CASH' && !reference.trim()) {
      setError('شماره پیگیری برای این روش پرداخت لازم است.');
      return;
    }
    if (tab === 'wallet' && !file) {
      setError('فایل یا عکس فیش را انتخاب کنید.');
      return;
    }

    setBusy(true);
    try {
      if (tab === 'wallet') {
        const created = await internalPaymentsApi.submitInPersonReceipt({
          customerId,
          method,
          amount: rialAmount,
          referenceNumber: toLatinDigits(reference.trim()) || undefined,
          notes: notes.trim() || undefined,
          file: file!,
        });
        if (canValidate) {
          await internalPaymentsApi.validate(created.id);
          onRecorded('پرداخت ثبت و تأیید شد؛ اعتبار مشتری افزایش یافت.');
        } else {
          onRecorded('فیش حضوری ثبت شد و منتظر تأیید حسابداری است.');
        }
      } else {
        const result = await internalPaymentsApi.record({
          idempotencyKey: crypto.randomUUID(),
          tradeId: tradeId.trim(),
          method,
          amount: rialAmount,
          referenceNumber: toLatinDigits(reference.trim()) || undefined,
          notes: notes.trim() || undefined,
        });
        if (canValidate && result.payment.status === 'PENDING') {
          await internalPaymentsApi.validate(result.payment.id);
          onRecorded('پرداخت معامله ثبت و تأیید شد.');
        } else {
          onRecorded('پرداخت روی معامله ثبت شد.');
        }
      }
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : 'ثبت پرداخت انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-start">
      <button type="button" className="absolute inset-0 z-0 bg-black/40" aria-label="بستن" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-payment-drawer-title"
        className="relative z-10 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl outline-none"
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 id="new-payment-drawer-title" className="text-base font-bold text-slate-900">
            ثبت پرداخت جدید
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-100 p-1.5">
            <button
              type="button"
              onClick={() => setTab('wallet')}
              className={cn(
                'rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                tab === 'wallet' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white',
              )}
            >
              واریز به کیف پول (اعتبار)
            </button>
            <button
              type="button"
              onClick={() => setTab('trade')}
              className={cn(
                'rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                tab === 'trade' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white',
              )}
            >
              تسویه معامله / سفارش
            </button>
          </div>

          {error ? (
            <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-4 space-y-4">
            {tab === 'wallet' ? (
              <SearchableSelect
                label="مشتری"
                hint="جستجو با نام یا شماره موبایل"
                placeholder="انتخاب مشتری..."
                searchPlaceholder="نام یا موبایل را بنویسید..."
                emptyMessage="مشتری‌ای با این مشخصات پیدا نشد"
                value={customerId}
                options={mergedCustomers}
                loading={customerLoading}
                onChange={(id) => {
                  const next = mergedCustomers.find((opt) => opt.value === id) ?? null;
                  setSelectedCustomer(id ? next : null);
                  setCustomerId(id);
                }}
                onQueryChange={searchCustomers}
              />
            ) : (
              <Input
                label="شناسه معامله"
                dir="ltr"
                value={tradeId}
                onChange={(event) => setTradeId(event.target.value)}
              />
            )}

            <label className="block text-sm font-medium text-slate-700">
              روش پرداخت
              <select
                className={fieldClass}
                value={method}
                onChange={(event) => setMethod(event.target.value)}
                aria-label="روش پرداخت"
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                مبلغ (تومان)
                <input
                  className={cn(fieldClass, 'font-semibold')}
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => setAmount(formatGroupedPersianInteger(event.target.value))}
                  aria-label="مبلغ (تومان)"
                  placeholder="۰"
                />
              </label>
              {wordsLabel ? <p className="mt-1.5 text-sm font-medium text-emerald-600">{wordsLabel}</p> : null}
            </div>

            <Input
              label="شماره پیگیری / شماره ارجاع"
              dir="ltr"
              autoComplete="off"
              value={reference}
              onChange={(event) => setReference(toPersianDigits(event.target.value))}
            />

            <Input label="یادداشت" value={notes} onChange={(event) => setNotes(event.target.value)} />

            {tab === 'wallet' ? (
              <div className="block text-sm font-medium text-slate-700">
                بارگذاری فیش فیزیکی
                {file ? (
                  <div className="mt-1 flex items-center gap-3 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 px-3 py-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white">
                      {previewUrl ? (
                        // Blob preview; next/image is not suitable for object URLs here.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <FileText className="h-6 w-6 text-emerald-600" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{fileSizeLabel(file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      حذف فیش
                    </button>
                  </div>
                ) : (
                  <label
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setDragging(true);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'copy';
                      setDragging(true);
                    }}
                    onDragLeave={(event) => {
                      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                      setDragging(false);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragging(false);
                      applyFile(event.dataTransfer.files[0]);
                    }}
                    className={cn(
                      'mt-1 flex min-h-[7rem] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-3 py-4 text-center transition-colors',
                      dragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50',
                    )}
                  >
                    <Upload className="h-7 w-7 text-emerald-600" aria-hidden />
                    <p className="mt-2 text-sm font-semibold text-slate-900">فایل را اینجا رها کنید</p>
                    <p className="mt-1 text-xs leading-6 text-slate-500">
                      یا برای انتخاب کلیک کنید. JPG، PNG، WebP یا PDF تا ۱۰ مگابایت
                    </p>
                    <input
                      ref={fileInputRef}
                      className="sr-only"
                      type="file"
                      accept={RECEIPT_ACCEPT}
                      aria-label="فایل فیش"
                      onChange={(event) => {
                        applyFile(event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <footer className="border-t border-slate-200 px-4 py-3">
          <Button className="w-full" isLoading={busy} onClick={() => void submit()}>
            ثبت و تایید تراکنش
          </Button>
        </footer>
      </div>
    </div>
  );
}
