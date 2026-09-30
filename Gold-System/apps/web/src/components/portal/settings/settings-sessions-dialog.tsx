'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ActiveSessionsPanel } from '@/components/sessions/active-sessions-panel';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

export function SettingsSessionsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <SessionsDialogBody onClose={onClose} />;
}

function SessionsDialogBody({ onClose }: { onClose: () => void }) {
  const { logout } = useAuth();
  const { data: sessions, error, isLoading, mutate } = useSWR('auth/sessions', () => authApi.sessions());
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  return (
    <Modal open onClose={onClose} title="دستگاه‌های فعال" className="max-w-lg">
      {error ? (
        <Alert variant="error">فهرست نشست‌ها بارگذاری نشد</Alert>
      ) : (
        <>
          {actionError ? (
            <div className="mb-3">
              <Alert variant="error">{actionError}</Alert>
            </div>
          ) : null}
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
              } catch {
                setActionError('پایان نشست انجام نشد. لطفاً دوباره تلاش کنید.');
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
              } catch {
                setActionError('پایان نشست‌ها انجام نشد. لطفاً دوباره تلاش کنید.');
              } finally {
                setPending(false);
              }
            }}
          />
        </>
      )}
      <div className="mt-5 flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          بستن
        </Button>
      </div>
    </Modal>
  );
}
