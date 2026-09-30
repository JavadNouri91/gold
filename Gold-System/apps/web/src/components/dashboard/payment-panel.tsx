'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from './confirm-dialog';
import { PermissionGate } from './permission-gate';
import { internalPaymentsApi, type StaffPayment, type TradePaymentStatus } from '@/lib/internal-api';
import { ApiClientError } from '@/lib/api';
import { formatMoney } from '@/lib/utils';

export function PaymentActionPanel({
  payment,
  status,
  onChanged,
}: {
  payment: StaffPayment;
  status?: TradePaymentStatus | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<'validate' | 'allocate' | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (open === 'validate') await internalPaymentsApi.validate(payment.id);
      if (open === 'allocate') {
        await internalPaymentsApi.allocate(payment.id, {
          tradeId: payment.tradeId,
          amount: amount.trim(),
        });
      }
      setFeedback('عملیات پرداخت ثبت شد.');
      setOpen(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'عملیات پرداخت انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {status ? (
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <p>جمع معامله: {formatMoney(status.tradeTotal)}</p>
          <p>تخصیص‌یافته: {formatMoney(status.totalAllocated)}</p>
          <p>مانده: {formatMoney(status.remaining)}</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <PermissionGate anyOf="payment.validate">
          <Button variant="outline" onClick={() => setOpen('validate')}>تأیید پرداخت</Button>
        </PermissionGate>
        <PermissionGate anyOf="payment.allocate">
          <Button onClick={() => setOpen('allocate')}>تخصیص به معامله</Button>
        </PermissionGate>
      </div>
      {open === 'allocate' ? (
        <Input
          label="مبلغ تخصیص (همان مقدار ارسالی به سرور)"
          dir="ltr"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      ) : null}
      <ConfirmDialog
        open={open !== null}
        title={open === 'allocate' ? 'تخصیص پرداخت' : 'تأیید پرداخت'}
        message="مانده حساب از این صفحه تغییر داده نمی‌شود. سرور تخصیص و وضعیت تسویه را ثبت می‌کند."
        isLoading={busy}
        onClose={() => setOpen(null)}
        onConfirm={() => void run()}
      />
    </div>
  );
}

export function SettlementSummary({
  total,
  settled,
  status,
  settledAt,
}: {
  total?: string | null;
  settled: string;
  status: string;
  settledAt?: string | null;
}) {
  return (
    <div className="space-y-2">
      <div className="h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full bg-gold-500" style={{ width: displayShare(settled, total) }} />
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p>مبلغ تسویه‌شده: {formatMoney(settled)}</p>
        <p>جمع مرجع: {formatMoney(total)}</p>
        <p>وضعیت: {status}</p>
        <p>تاریخ: {settledAt ?? '—'}</p>
      </div>
    </div>
  );
}

/** Visual share only. The text amounts stay the backend strings. */
function displayShare(settled: string, total?: string | null): string {
  const paid = scale(settled);
  const whole = scale(total);
  if (whole <= BigInt(0)) return '0%';
  const percent = (paid * BigInt(100)) / whole;
  const bounded = percent > BigInt(100) ? BigInt(100) : percent;
  return `${bounded.toString()}%`;
}

function scale(value?: string | null): bigint {
  if (!value || !/^\d+(\.\d+)?$/.test(value)) return BigInt(0);
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * BigInt(1000000) + BigInt((fraction + '000000').slice(0, 6));
}
