'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { ApiClientError, paymentsApi } from '@/lib/api';
import { PAYMENT_METHOD_LABELS, toLatinDigits } from '@/lib/utils';
import { InboxSheet } from '@/components/portal/notifications/inbox-sheet';

type PayableTrade = {
  id: string;
  tradeNumber: string;
  orderNumber: string | null;
  totalAmountRial: string;
};

const fieldClass =
  'mt-1 min-h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#202124] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]';

export function SubmitReceiptButton({ onSubmitted }: { onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [trades, setTrades] = useState<PayableTrade[]>([]);
  const [tradeId, setTradeId] = useState('');
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openSheet = async () => {
    setError(null);
    setOpen(true);
    try {
      const rows = await paymentsApi.payableTrades();
      setTrades(rows);
      setTradeId(rows[0]?.id ?? '');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'معامله‌های قابل پرداخت دریافت نشد.');
    }
  };

  const submit = async () => {
    setError(null);
    if (!tradeId) {
      setError('معامله تأییدشده‌ای برای ثبت رسید نیست.');
      return;
    }
    if (!file) {
      setError('فایل رسید را انتخاب کنید.');
      return;
    }
    const normalizedAmount = toLatinDigits(amount).replace(/[^\d.]/g, '');
    if (!normalizedAmount) {
      setError('مبلغ را وارد کنید.');
      return;
    }
    if (method !== 'CASH' && !reference.trim()) {
      setError('شماره پیگیری برای این روش پرداخت لازم است.');
      return;
    }
    setBusy(true);
    try {
      await paymentsApi.submitReceipt({
        tradeId,
        method,
        amount: normalizedAmount,
        referenceNumber: toLatinDigits(reference.trim()) || undefined,
        file,
      });
      setOpen(false);
      setFile(null);
      setAmount('');
      setReference('');
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'ثبت رسید انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void openSheet()}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F59E0B] px-4 text-sm font-bold text-[#202124] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]"
      >
        <Upload className="h-4 w-4" aria-hidden />
        ثبت رسید
      </button>
      <InboxSheet
        open={open}
        title="ثبت رسید پرداخت"
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        footer={
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="min-h-11 w-full rounded-xl bg-[#C8922E] text-sm font-bold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]"
          >
            {busy ? 'در حال ارسال…' : 'ارسال رسید'}
          </button>
        }
      >
        <p className="mb-4 text-sm leading-7 text-[#6B7280]">
          رسید حواله یا کارت‌به‌کارت را برای معامله تأییدشده خود بفرستید. تا تأیید حسابداری، وضعیت آن «در انتظار تأیید» می‌ماند.
        </p>
        {error ? <p className="mb-3 text-sm text-[#DC2626]">{error}</p> : null}
        <label className="mb-3 block text-sm text-[#6B7280]">
          معامله
          <select className={fieldClass} value={tradeId} onChange={(event) => setTradeId(event.target.value)} aria-label="معامله">
            {trades.length === 0 ? <option value="">معامله تأییدشده‌ای نیست</option> : null}
            {trades.map((trade) => (
              <option key={trade.id} value={trade.id}>
                {trade.orderNumber || trade.tradeNumber}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-3 block text-sm text-[#6B7280]">
          روش پرداخت
          <select className={fieldClass} value={method} onChange={(event) => setMethod(event.target.value)} aria-label="روش پرداخت">
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="mb-3 block text-sm text-[#6B7280]">
          مبلغ (ریال)
          <input className={fieldClass} inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="مبلغ" />
        </label>
        <label className="mb-3 block text-sm text-[#6B7280]">
          شماره پیگیری
          <input className={fieldClass} dir="ltr" value={reference} onChange={(event) => setReference(event.target.value)} aria-label="شماره پیگیری" />
        </label>
        <label className="block text-sm text-[#6B7280]">
          فایل رسید
          <input
            className={`${fieldClass} py-2`}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            aria-label="فایل رسید"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
      </InboxSheet>
    </>
  );
}
