'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { reportsApi } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { formatDateTime } from '@/lib/utils';

export default function AuditPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, 'ledger.read');
  const [draft, setDraft] = useState({
    actorId: '',
    action: '',
    entityType: '',
    entityId: '',
    from: '',
    to: '',
  });
  const [applied, setApplied] = useState(draft);
  const [page, setPage] = useState(1);
  const report = useSWR(allowed ? ['audit', applied, page] : null, () =>
    reportsApi.audit({
      actorId: applied.actorId || undefined,
      action: applied.action || undefined,
      entityType: applied.entityType || undefined,
      entityId: applied.entityId || undefined,
      from: applied.from || undefined,
      to: applied.to || undefined,
      limit: 20,
      offset: (page - 1) * 20,
    }),
  );

  if (!allowed) return <ForbiddenNotice permission="ledger.read" />;

  return (
    <div className="space-y-4">
      <PageHeader title="ممیزی" description="رکوردهای ممیزی فقط خواندنی هستند و حذف یا ویرایش نمی‌شوند." />
      <FilterBar
        fields={[
          { key: 'actorId', label: 'عامل', dir: 'ltr' },
          { key: 'action', label: 'عمل', dir: 'ltr' },
          { key: 'entityType', label: 'موجودیت', dir: 'ltr' },
          { key: 'entityId', label: 'شناسه موجودیت', dir: 'ltr' },
          { key: 'from', label: 'از', type: 'date' },
          { key: 'to', label: 'تا', type: 'date' },
        ]}
        values={draft}
        onChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
        onSubmit={() => {
          setApplied(draft);
          setPage(1);
        }}
        onReset={() => {
          const empty = { actorId: '', action: '', entityType: '', entityId: '', from: '', to: '' };
          setDraft(empty);
          setApplied(empty);
          setPage(1);
        }}
      />
      {report.error ? <ApiErrorState error={report.error} onRetry={() => void report.mutate()} /> : null}
      {report.isLoading ? <p className="text-sm">در حال دریافت…</p> : null}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground">
              {['زمان', 'عامل', 'عمل', 'موجودیت', 'شناسه', 'دلیل'].map((header) => (
                <th key={header} className="px-3 py-2 text-right">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(report.data?.logs ?? []).map((log) => (
              <tr key={log.id} className="border-t">
                <td className="px-3 py-2">{formatDateTime(log.createdAt)}</td>
                <td className="px-3 py-2" dir="ltr">{log.actorId ?? log.actorType}</td>
                <td className="px-3 py-2" dir="ltr">{log.action}</td>
                <td className="px-3 py-2">{log.entityType ?? '—'}</td>
                <td className="px-3 py-2" dir="ltr">{log.entityId ?? '—'}</td>
                <td className="px-3 py-2">{log.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.data && report.data.logs.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">رکوردی با این فیلتر نیست.</p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <button type="button" className="rounded-md border px-3 py-1 text-sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>قبلی</button>
        <button type="button" className="rounded-md border px-3 py-1 text-sm" disabled={(report.data?.logs.length ?? 0) < 20} onClick={() => setPage((current) => current + 1)}>بعدی</button>
      </div>
    </div>
  );
}
