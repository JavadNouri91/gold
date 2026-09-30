'use client';

import useSWR from 'swr';
import { staffNotificationsApi } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { ApiErrorState } from '@/components/dashboard/states';
import { formatDateTime } from '@/lib/utils';

export default function NotificationsPage() {
  const notes = useSWR('staff-notifications', () => staffNotificationsApi.list({ limit: 50, offset: 0 }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="اعلان‌ها"
        description="اعلان‌های همین کاربر از سرور خوانده می‌شود. وضعیت خوانده‌شدن در سرویس وجود ندارد."
      />
      {notes.error ? <ApiErrorState error={notes.error} onRetry={() => void notes.mutate()} /> : null}
      {notes.data && notes.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">اعلانی نیست.</p>
      ) : null}
      <ul className="divide-y rounded-xl border bg-white">
        {(notes.data ?? []).map((note) => (
          <li key={note.id} className="space-y-1 px-4 py-3">
            <p className="text-sm font-medium">{note.subject ?? note.type}</p>
            <p className="text-sm">{note.body}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(note.createdAt)} — {note.status} — {note.channel}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
