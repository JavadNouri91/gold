'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AuthSession } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

const LABEL: Record<string, string> = {
  Desktop: 'رایانه',
  iPhone: 'آیفون',
  iPad: 'آیپد',
  Android: 'اندروید',
  'Android tablet': 'تبلت اندروید',
  Mobile: 'موبایل',
  Chrome: 'کروم',
  Firefox: 'فایرفاکس',
  Safari: 'سافاری',
  Edge: 'اج',
  Opera: 'اپرا',
  Browser: 'مرورگر',
  Windows: 'ویندوز',
  iOS: 'iOS',
  macOS: 'مک',
  Linux: 'لینوکس',
  Unknown: 'نامشخص',
};

function label(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  return LABEL[value] ?? value;
}

export function ActiveSessionsPanel({
  sessions,
  isLoading,
  error,
  onRevoke,
  onRevokeOthers,
  pending,
}: {
  sessions: AuthSession[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRevoke: (session: AuthSession) => Promise<void>;
  onRevokeOthers: () => Promise<void>;
  pending: boolean;
}) {
  const [target, setTarget] = useState<AuthSession | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);

  if (error) return <Alert variant="error">فهرست نشست‌ها بارگذاری نشد.</Alert>;
  if (isLoading) return <p className="text-sm text-muted-foreground">در حال بارگذاری…</p>;
  if (!sessions?.length) {
    return <p className="text-sm text-muted-foreground">نشست فعالی وجود ندارد.</p>;
  }

  const others = sessions.filter((session) => !session.current);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">نشست‌های باز این حساب. پایان دادن، رکورد را حذف نمی‌کند.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || others.length === 0}
          onClick={() => setOthersOpen(true)}
        >
          پایان دادن به سایر نشست‌ها
        </Button>
      </div>
      <ul className="space-y-3">
        {sessions.map((session) => (
          <li key={session.id} className="rounded-xl border border-slate-100 px-3 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-slate-800">
                {label(session.device, 'دستگاه')} · {label(session.browser, 'مرورگر')}
              </p>
              <div className="flex items-center gap-2">
                {session.current ? <Badge variant="green">دستگاه فعلی</Badge> : <Badge variant="gray">فعال</Badge>}
              </div>
            </div>
            <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <div>سیستم: {label(session.os, 'نامشخص')}</div>
              <div>
                IP: <bdi dir="ltr">{session.ipAddress ?? '—'}</bdi>
              </div>
              <div>ورود: {formatDateTime(session.createdAt)}</div>
              <div>آخرین فعالیت: {formatDateTime(session.lastActivityAt ?? session.createdAt)}</div>
            </dl>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant={session.current ? 'outline' : 'destructive'}
                size="sm"
                disabled={pending}
                onClick={() => setTarget(session)}
              >
                پایان نشست
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={target != null}
        title={target?.current ? 'خروج از دستگاه فعلی' : 'پایان نشست'}
        message={
          target?.current
            ? 'این نشست دستگاه فعلی شماست. با پایان دادن به آن از سامانه خارج می‌شوید. ادامه می‌دهید؟'
            : 'این دستگاه باید دوباره وارد شود. ادامه می‌دهید؟'
        }
        confirmLabel="پایان نشست"
        destructive
        isLoading={pending}
        onClose={() => setTarget(null)}
        onConfirm={() => {
          if (!target) return;
          void onRevoke(target).finally(() => setTarget(null));
        }}
      />
      <ConfirmDialog
        open={othersOpen}
        title="پایان دادن به سایر نشست‌ها"
        message="همه نشست‌های دیگر پایان می‌یابند و آن دستگاه‌ها باید دوباره وارد شوند. ادامه می‌دهید؟"
        confirmLabel="پایان سایر نشست‌ها"
        destructive
        isLoading={pending}
        onClose={() => setOthersOpen(false)}
        onConfirm={() => {
          void onRevokeOthers().finally(() => setOthersOpen(false));
        }}
      />
    </div>
  );
}
