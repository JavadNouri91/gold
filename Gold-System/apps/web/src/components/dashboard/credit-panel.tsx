'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { PermissionGate } from './permission-gate';
import { internalCustomersApi, type StaffAccount } from '@/lib/internal-api';
import { ApiClientError } from '@/lib/api';
import { formatMoney } from '@/lib/utils';

export function CreditSummary({ account }: { account: StaffAccount }) {
  const rows = [
    ['سقف اعتبار ریالی', account.creditLimitRial],
    ['رزرو شده', account.reservedCreditRial],
    ['مصرف‌شده', account.consumedCreditRial],
    ['در دسترس', account.availableRial],
    ['سقف اعتبار طلایی (ریال)', account.creditLimitGoldRial],
    ['رزرو اعتبار طلایی', account.reservedCreditGoldRial],
    ['مصرف اعتبار طلایی', account.consumedCreditGoldRial],
    ['در دسترس اعتبار طلایی', account.availableGoldRial],
  ] as const;

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-lg border p-3">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-lg font-semibold">{formatMoney(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function GrantCreditForm({
  customerId,
  onGranted,
}: {
  customerId: string;
  onGranted: () => void;
}) {
  const [pool, setPool] = useState<'RIAL' | 'GOLD_RIAL'>('RIAL');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await internalCustomersApi.grantCredit(customerId, {
        pool,
        amount: amount.trim(),
        reason: reason.trim(),
      });
      setFeedback('اعتبار توسط سرور ثبت شد.');
      setAmount('');
      setReason('');
      onGranted();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'ثبت اعتبار انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PermissionGate anyOf="credit.manage">
      <div className="space-y-3 rounded-xl border p-4">
        <h3 className="font-semibold">افزایش اعتبار</h3>
        {feedback ? <Alert variant="success">{feedback}</Alert> : null}
        {error ? <Alert variant="error">{error}</Alert> : null}
        <label className="block text-sm">
          مخزن
          <select
            className="mt-1 h-10 w-full rounded-md border px-3"
            value={pool}
            onChange={(event) => setPool(event.target.value as 'RIAL' | 'GOLD_RIAL')}
          >
            <option value="RIAL">ریالی</option>
            <option value="GOLD_RIAL">اعتبار طلایی</option>
          </select>
        </label>
        <Input label="مبلغ" dir="ltr" value={amount} onChange={(event) => setAmount(event.target.value)} />
        <Input label="دلیل" value={reason} onChange={(event) => setReason(event.target.value)} />
        <Button disabled={amount.trim().length === 0 || reason.trim().length < 5} isLoading={busy} onClick={() => void submit()}>
          ثبت
        </Button>
      </div>
    </PermissionGate>
  );
}
