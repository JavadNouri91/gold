'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { internalPaymentsApi, type StaffPayment } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { PermissionGate } from '@/components/dashboard/permission-gate';
import { ApiClientError } from '@/lib/api';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  formatDateTime,
  formatMoney,
  statusLabel,
} from '@/lib/utils';

const LIMIT = 20;

export default function PaymentsPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, ['payment.read', 'payment.create']);
  const [draft, setDraft] = useState({ status: '', tradeId: '', customerId: '' });
  const [applied, setApplied] = useState(draft);
  useEffect(() => {
    const customerId = new URLSearchParams(window.location.search).get('customerId') ?? '';
    if (!customerId) return;
    setDraft((current) => ({ ...current, customerId }));
    setApplied((current) => ({ ...current, customerId }));
  }, []);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ tradeId: '', method: 'BANK_TRANSFER', amount: '', referenceNumber: '', notes: '' });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, error, isLoading, mutate } = useSWR(
    allowed ? ['payments', applied, page] : null,
    () =>
      internalPaymentsApi.list({
        status: applied.status || undefined,
        tradeId: applied.tradeId || undefined,
        customerId: applied.customerId || undefined,
        limit: LIMIT,
        offset: (page - 1) * LIMIT,
      }),
  );

  if (!allowed) return <ForbiddenNotice permission="payment.read" />;

  const columns: Column<StaffPayment>[] = [
    {
      key: 'id',
      header: 'پرداخت',
      render: (row) => <Link className="text-gold-800" href={`/dashboard/payments/${row.id}`}>جزئیات</Link>,
    },
    {
      key: 'customer',
      header: 'مشتری',
      render: (row) => <Link href={`/dashboard/customers/${row.customerId}`}>مشتری</Link>,
    },
    {
      key: 'trade',
      header: 'معامله',
      render: (row) => <Link href={`/dashboard/trades/${row.tradeId}`}>معامله</Link>,
    },
    { key: 'amount', header: 'مبلغ', render: (row) => formatMoney(row.amount) },
    { key: 'method', header: 'روش', render: (row) => statusLabel(PAYMENT_METHOD_LABELS, row.method) },
    { key: 'ref', header: 'ارجاع', render: (row) => row.referenceNumber ?? '—' },
    { key: 'date', header: 'تاریخ', render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => <StatusBadge status={row.status} label={statusLabel(PAYMENT_STATUS_LABELS, row.status)} />,
    },
  ];

  const record = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await internalPaymentsApi.record({
        idempotencyKey: crypto.randomUUID(),
        tradeId: form.tradeId.trim(),
        method: form.method,
        amount: form.amount.trim(),
        referenceNumber: form.referenceNumber.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setFeedback('پرداخت ثبت شد.');
      void mutate();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'ثبت پرداخت انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="پرداخت‌ها" description="ثبت، تأیید و تخصیص فقط با مجوز حسابداری و از مسیر سرور انجام می‌شود." />
      <FilterBar
        fields={[
          {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
          },
          { key: 'tradeId', label: 'شناسه معامله', dir: 'ltr' },
          { key: 'customerId', label: 'شناسه مشتری', dir: 'ltr' },
        ]}
        values={draft}
        onChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
        onSubmit={() => {
          setApplied(draft);
          setPage(1);
        }}
      />
      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {formError ? <Alert variant="error">{formError}</Alert> : null}
      <PermissionGate anyOf="payment.create">
        <div className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-2">
          <Input label="شناسه معامله" dir="ltr" value={form.tradeId} onChange={(event) => setForm({ ...form, tradeId: event.target.value })} />
          <label className="text-sm">
            روش
            <select className="mt-1 h-10 w-full rounded-md border px-3" value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <Input label="مبلغ" dir="ltr" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
          <Input label="شماره ارجاع" dir="ltr" value={form.referenceNumber} onChange={(event) => setForm({ ...form, referenceNumber: event.target.value })} />
          <Input label="یادداشت" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          <div className="flex items-end">
            <Button isLoading={busy} onClick={() => void record()}>ثبت پرداخت</Button>
          </div>
        </div>
      </PermissionGate>
      {error ? <ApiErrorState error={error} onRetry={() => void mutate()} /> : null}
      <DataTable columns={columns} rows={data?.data ?? []} isLoading={isLoading} />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>قبلی</Button>
        <Button variant="outline" size="sm" disabled={(data?.data.length ?? 0) < LIMIT} onClick={() => setPage((current) => current + 1)}>بعدی</Button>
      </div>
    </div>
  );
}
