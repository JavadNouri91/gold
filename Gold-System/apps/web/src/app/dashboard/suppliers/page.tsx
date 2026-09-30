'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { suppliersApi, type SupplierRecord } from '@/lib/internal-api';
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
import { SUPPLIER_STATUS_LABELS, statusLabel } from '@/lib/utils';

export default function SuppliersPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, 'supplier.read');
  const [status, setStatus] = useState('');
  const [applied, setApplied] = useState('');
  const [name, setName] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { data, error, isLoading, mutate } = useSWR(
    allowed ? ['suppliers', applied] : null,
    () => suppliersApi.list({ status: applied || undefined, limit: 50, offset: 0 }),
  );

  if (!allowed) return <ForbiddenNotice permission="supplier.read" />;

  const columns: Column<SupplierRecord>[] = [
    {
      key: 'name',
      header: 'نام',
      render: (row) => <Link className="font-medium text-gold-800" href={`/dashboard/suppliers/${row.id}`}>{row.name}</Link>,
    },
    { key: 'number', header: 'شماره', render: (row) => <span dir="ltr">{row.supplierNumber}</span> },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => <StatusBadge status={row.status} label={statusLabel(SUPPLIER_STATUS_LABELS, row.status)} />,
    },
    { key: 'mode', header: 'ارتباط', render: (row) => row.integrationMode },
  ];

  const create = async () => {
    setFormError(null);
    try {
      await suppliersApi.create({ name: name.trim() });
      setFeedback('تأمین‌کننده ثبت شد.');
      setName('');
      void mutate();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'ثبت انجام نشد.');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="تأمین‌کنندگان" description="اتصال بیرونی ساخته نمی‌شود. ثبت دستی همان روش فعلی سرور است." />
      <FilterBar
        fields={[{
          key: 'status',
          label: 'وضعیت',
          type: 'select',
          options: Object.entries(SUPPLIER_STATUS_LABELS).map(([value, label]) => ({ value, label })),
        }]}
        values={{ status }}
        onChange={(_, value) => setStatus(value)}
        onSubmit={() => setApplied(status)}
      />
      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {formError ? <Alert variant="error">{formError}</Alert> : null}
      <PermissionGate anyOf="supplier.create">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-64">
            <Input label="نام تأمین‌کننده" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <Button disabled={!name.trim()} onClick={() => void create()}>ایجاد</Button>
        </div>
      </PermissionGate>
      {error ? <ApiErrorState error={error} onRetry={() => void mutate()} /> : null}
      <DataTable columns={columns} rows={data ?? []} isLoading={isLoading} />
    </div>
  );
}
