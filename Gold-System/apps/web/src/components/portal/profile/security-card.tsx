'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Lock, MonitorSmartphone, Shield } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { ActiveSessionsPanel } from '@/components/sessions/active-sessions-panel';
import { toPersianDigits } from '@/lib/utils';

export function SecurityCard() {
  const { logout } = useAuth();
  const { data: sessions, error, isLoading, mutate } = useSWR('auth/sessions', () => authApi.sessions());
  const [panel, setPanel] = useState<'password' | 'otp' | 'sessions' | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const sessionCount = sessions?.length;

  return (
    <section id="security" className="scroll-mt-24 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-slate-800">امنیت حساب</h2>
      <ul className="mt-4 space-y-3">
        <SecurityRow
          icon={Lock}
          label="رمز عبور"
          value="********"
          ltr
          action="تغییر رمز"
          onAction={() => setPanel('password')}
        />
        <SecurityRow
          icon={Shield}
          label="تأیید دومرحله‌ای"
          value="فعال"
          valueClassName="text-emerald-700"
          action="مشاهده"
          onAction={() => setPanel('otp')}
        />
        <SecurityRow
          icon={MonitorSmartphone}
          label="نشست‌های فعال"
          value={
            isLoading
              ? '…'
              : error || sessionCount == null
                ? '—'
                : `${toPersianDigits(String(sessionCount))} نشست`
          }
          action="مشاهده"
          onAction={() => setPanel('sessions')}
        />
      </ul>

      <Modal open={panel === 'password'} onClose={() => setPanel(null)} title="تغییر رمز عبور">
        <p className="text-sm leading-7 text-muted-foreground">
          تغییر رمز عبور از این صفحه انجام نمی‌شود. ورود به سامانه با رمز عبور و کد یکبارمصرف پیامکی
          است. برای تغییر رمز با پشتیبانی تماس بگیرید.
        </p>
        <ModalClose onClose={() => setPanel(null)} />
      </Modal>

      <Modal open={panel === 'otp'} onClose={() => setPanel(null)} title="تأیید دومرحله‌ای">
        <p className="text-sm leading-7 text-muted-foreground">
          تأیید دومرحله‌ای فعال است. هر ورود، پس از رمز عبور، با کد یکبارمصرف پیامکی تکمیل می‌شود و
          از این صفحه خاموش نمی‌شود.
        </p>
        <ModalClose onClose={() => setPanel(null)} />
      </Modal>

      <Modal
        open={panel === 'sessions'}
        onClose={() => setPanel(null)}
        title="نشست‌های فعال"
        className="max-w-lg"
      >
        {error ? (
          <Alert variant="error">فهرست نشست‌ها بارگذاری نشد</Alert>
        ) : (
          <>
            {actionError ? <div className="mb-3"><Alert variant="error">{actionError}</Alert></div> : null}
            <ActiveSessionsPanel
              sessions={sessions}
              isLoading={isLoading}
              error={null}
              pending={pending}
              onRevoke={async (session) => {
                setActionError(null);
                setPending(true);
                try {
                  await authApi.revokeSession(session.id);
                  if (session.current) {
                    await logout();
                    return;
                  }
                  await mutate();
                } catch (err) {
                  setActionError(err instanceof Error ? err.message : 'پایان نشست انجام نشد.');
                } finally {
                  setPending(false);
                }
              }}
              onRevokeOthers={async () => {
                setActionError(null);
                setPending(true);
                try {
                  await authApi.revokeOtherSessions();
                  await mutate();
                } catch (err) {
                  setActionError(err instanceof Error ? err.message : 'پایان نشست‌ها انجام نشد.');
                } finally {
                  setPending(false);
                }
              }}
            />
          </>
        )}
        <ModalClose onClose={() => setPanel(null)} />
      </Modal>
    </section>
  );
}

function SecurityRow({
  icon: Icon,
  label,
  value,
  valueClassName,
  ltr,
  action,
  onAction,
}: {
  icon: typeof Lock;
  label: string;
  value: string;
  valueClassName?: string;
  ltr?: boolean;
  action: string;
  onAction: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p
            className={`mt-0.5 text-sm font-semibold ${valueClassName ?? 'text-slate-800'}`}
            dir={ltr ? 'ltr' : undefined}
          >
            {value}
          </p>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onAction}>
        {action}
      </Button>
    </li>
  );
}

function ModalClose({ onClose }: { onClose: () => void }) {
  return (
    <div className="mt-5 flex justify-end">
      <Button type="button" variant="outline" onClick={onClose}>
        بستن
      </Button>
    </div>
  );
}
