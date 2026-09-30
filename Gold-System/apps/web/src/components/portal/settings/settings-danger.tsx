'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { LogOut, Trash2 } from 'lucide-react';
import { authApi, customerApi, ordersApi, tradesApi } from '@/lib/api';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { DeleteAccountCard } from '@/components/portal/profile/delete-account-card';
import { readListTotal } from '@/components/portal/profile/read-list-total';
import { SettingsButtonRow, SettingsGroup } from './settings-list';

export function SettingsDangerZone() {
  const { mutate } = useSWRConfig();
  const [ready, setReady] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState(false);

  const account = useSWR(ready ? 'customer/me/account' : null, () => customerApi.getMyAccount());
  const orders = useSWR(ready ? 'profile/orders-count' : null, () => ordersApi.list({ limit: 1 }));
  const trades = useSWR(ready ? 'profile/trades-count' : null, () => tradesApi.list({ limit: 1 }));

  const countsLoading = ready && (account.isLoading || orders.isLoading || trades.isLoading);

  const signOutOthers = async () => {
    setPending(true);
    setNotice(null);
    try {
      await authApi.revokeOtherSessions();
      await mutate('auth/sessions');
      setNoticeError(false);
      setNotice('نشست‌های دیگر پایان یافت.');
      setConfirmOpen(false);
    } catch {
      setNoticeError(true);
      setNotice('پایان نشست‌ها انجام نشد. لطفاً دوباره تلاش کنید.');
      setConfirmOpen(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-w-0">
      <SettingsGroup
        tone="red"
        icon={Trash2}
        title="اقدامات حساب"
        description="مدیریت دسترسی و حذف حساب"
        footer={
          <div className="p-3" onClickCapture={() => setReady(true)}>
            {notice ? (
              <p className={`mb-2 px-1 text-sm ${noticeError ? 'text-[#DC2626]' : 'text-[#16A34A]'}`} role="status">
                {notice}
              </p>
            ) : null}
            <DeleteAccountCard
              variant="embedded"
              account={account.data}
              orderCount={orders.error ? null : readListTotal(orders.data)}
              tradeCount={trades.error ? null : readListTotal(trades.data)}
              countsLoading={countsLoading}
            />
          </div>
        }
      >
        <SettingsButtonRow
          icon={LogOut}
          title="خروج از سایر دستگاه‌ها"
          description="این دستگاه وارد می‌ماند. دستگاه‌های دیگر باید دوباره وارد شوند."
          onClick={() => {
            setNotice(null);
            setConfirmOpen(true);
          }}
        />
      </SettingsGroup>
      <ConfirmDialog
        open={confirmOpen}
        title="خروج از سایر دستگاه‌ها"
        message="همه نشست‌های دیگر پایان می‌یابند و آن دستگاه‌ها باید دوباره وارد شوند. این دستگاه وارد می‌ماند. ادامه می‌دهید؟"
        confirmLabel="پایان سایر نشست‌ها"
        destructive
        isLoading={pending}
        onClose={() => {
          if (!pending) setConfirmOpen(false);
        }}
        onConfirm={() => {
          void signOutOthers();
        }}
      />
    </div>
  );
}
