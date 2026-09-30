'use client';

import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { financialLedgerApi } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { LedgerTable } from '@/components/dashboard/ledger-tables';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/utils';

export default function FinancialLedgerPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, 'ledger.read');
  const accounts = useSWR(allowed ? 'ledger-accounts' : null, () => financialLedgerApi.accounts());
  const balances = useSWR(allowed ? 'ledger-balances' : null, () => financialLedgerApi.balances());
  const journals = useSWR(allowed ? 'ledger-journals' : null, () =>
    financialLedgerApi.journals({ limit: 20, offset: 0 }),
  );

  if (!allowed) return <ForbiddenNotice permission="ledger.read" />;

  return (
    <div className="space-y-4">
      <PageHeader title="دفتر مالی" description="این دفتر فقط خواندنی است. مانده از اسناد سرور می‌آید." />
      {accounts.error ? <ApiErrorState error={accounts.error} /> : null}
      <Card>
        <CardHeader><CardTitle>حساب‌ها و مانده</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-3 py-2 text-right">کد</th>
                <th className="px-3 py-2 text-right">نام</th>
                <th className="px-3 py-2 text-right">بدهکار</th>
                <th className="px-3 py-2 text-right">بستانکار</th>
                <th className="px-3 py-2 text-right">مانده</th>
              </tr>
            </thead>
            <tbody>
              {(balances.data ?? []).map((balance) => {
                const account = accounts.data?.find((item) => item.code === balance.accountCode);
                return (
                  <tr key={balance.accountCode} className="border-t">
                    <td className="px-3 py-2" dir="ltr">{balance.accountCode}</td>
                    <td className="px-3 py-2">{account?.nameFa ?? account?.name ?? '—'}</td>
                    <td className="px-3 py-2">{formatMoney(balance.totalDebit)}</td>
                    <td className="px-3 py-2">{formatMoney(balance.totalCredit)}</td>
                    <td className="px-3 py-2">{formatMoney(balance.balance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {journals.error ? <ApiErrorState error={journals.error} /> : null}
      <LedgerTable journals={journals.data?.journals ?? []} />
    </div>
  );
}
