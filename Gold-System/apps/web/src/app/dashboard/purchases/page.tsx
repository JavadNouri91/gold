'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { purchasesApi, type PurchaseRecord } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { ForbiddenNotice, PermissionGate } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { ApiClientError } from '@/lib/api';
import { PURCHASE_STATUS_LABELS, formatMoney, formatWeight, statusLabel } from '@/lib/utils';

export default function PurchasesPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, 'purchase.read');
  const [status, setStatus] = useState('');
  const [applied, setApplied] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    supplierId: '',
    settlementType: 'RIAL',
    purchaseDate: '',
    totalAmountRial: '',
    weightGrams: '',
    purityRatio: '',
    pricePerGramRial: '',
  });
  const { data, error, isLoading, mutate } = useSWR(
    allowed ? ['purchases', applied] : null,
    () => purchasesApi.list({ status: applied || undefined, limit: 50, offset: 0 }),
  );

  if (!allowed) return <ForbiddenNotice permission="purchase.read" />;

  const columns: Column<PurchaseRecord>[] = [
    {
      key: 'number',
      header: 'شماره',
      render: (row) => (
        <Link className="font-medium text-gold-800" href={`/dashboard/purchases/${row.id}`} dir="ltr">
          {row.purchaseNumber}
        </Link>
      ),
    },
    {
      key: 'supplier',
      header: 'تأمین‌کننده',
      render: (row) => <Link href={`/dashboard/suppliers/${row.supplierId}`}>تأمین‌کننده</Link>,
    },
    { key: 'amount', header: 'مبلغ', render: (row) => formatMoney(row.totalAmountRial) },
    { key: 'weight', header: 'وزن', render: (row) => formatWeight(row.weightGrams) },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => <StatusBadge status={row.status} label={statusLabel(PURCHASE_STATUS_LABELS, row.status)} />,
    },
  ];

  const create = async () => {
    setFormError(null);
    try {
      await purchasesApi.create({
        idempotencyKey: crypto.randomUUID(),
        supplierId: form.supplierId.trim(),
        settlementType: form.settlementType,
        purchaseDate: new Date(form.purchaseDate).toISOString(),
        totalAmountRial: form.totalAmountRial.trim(),
        weightGrams: form.weightGrams.trim(),
        purityRatio: form.purityRatio.trim(),
        pricePerGramRial: form.pricePerGramRial.trim(),
      });
      setFeedback('پیش‌نویس خرید ثبت شد.');
      void mutate();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'ثبت خرید انجام نشد.');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="خریدها" description="مقادیر همان‌طور که وارد می‌شوند به سرور ارسال می‌گردند." />
      <FilterBar
        fields={[{
          key: 'status',
          label: 'وضعیت',
          type: 'select',
          options: Object.entries(PURCHASE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
        }]}
        values={{ status }}
        onChange={(_, value) => setStatus(value)}
        onSubmit={() => setApplied(status)}
      />
      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {formError ? <Alert variant="error">{formError}</Alert> : null}
      <PermissionGate anyOf="purchase.create">
        <div className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-2">
          <Input label="شناسه تأمین‌کننده" dir="ltr" value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })} />
          <label className="text-sm">
            نوع تسویه
            <select className="mt-1 h-10 w-full rounded-md border px-3" value={form.settlementType} onChange={(event) => setForm({ ...form, settlementType: event.target.value })}>
              <option value="RIAL">ریال</option>
              <option value="GOLD">طلا</option>
            </select>
          </label>
          <Input label="تاریخ" type="date" dir="ltr" value={form.purchaseDate} onChange={(event) => setForm({ ...form, purchaseDate: event.target.value })} />
          <Input label="مبلغ" dir="ltr" value={form.totalAmountRial} onChange={(event) => setForm({ ...form, totalAmountRial: event.target.value })} />
          <Input label="وزن" dir="ltr" value={form.weightGrams} onChange={(event) => setForm({ ...form, weightGrams: event.target.value })} />
          <Input label="خلوص" dir="ltr" value={form.purityRatio} onChange={(event) => setForm({ ...form, purityRatio: event.target.value })} />
          <Input label="قیمت هر گرم" dir="ltr" value={form.pricePerGramRial} onChange={(event) => setForm({ ...form, pricePerGramRial: event.target.value })} />
          <div className="flex items-end"><Button onClick={() => void create()}>ثبت پیش‌نویس</Button></div>
        </div>
      </PermissionGate>
      {error ? <ApiErrorState error={error} onRetry={() => void mutate()} /> : null}
      <DataTable columns={columns} rows={data ?? []} isLoading={isLoading} />
    </div>
  );
}
