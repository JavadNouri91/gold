'use client';

import { useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { ApiClientError, paymentsApi } from '@/lib/api';
import {
  PAYMENT_METHOD_LABELS,
  formatGroupedPersianInteger,
  toLatinDigits,
  tomanToRial,
  toPersianDigits,
} from '@/lib/utils';
import { InboxSheet } from '@/components/portal/notifications/inbox-sheet';

const fieldClass =
  'mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]';

const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const RECEIPT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export function SubmitReceiptButton({ onSubmitted }: { onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openSheet = () => {
    setError(null);
    setDragging(false);
    setOpen(true);
  };

  const closeSheet = () => {
    if (busy) return;
    setOpen(false);
    setDragging(false);
  };

  const applyFile = (candidate: File | undefined) => {
    if (!candidate) return;
    if (!RECEIPT_TYPES.has(candidate.type)) {
      setError('فقط تصویر JPG، PNG، WebP یا PDF پذیرفته می‌شود.');
      return;
    }
    if (candidate.size > MAX_RECEIPT_BYTES) {
      setError('حجم رسید نباید بیشتر از ۱۰ مگابایت باشد.');
      return;
    }
    setError(null);
    setFile(candidate);
  };

  const submit = async () => {
    setError(null);
    if (!file) {
      setError('فایل رسید را انتخاب کنید.');
      return;
    }
    const tomanAmount = toLatinDigits(amount).replace(/[^\d.]/g, '');
    const normalizedAmount = tomanAmount ? tomanToRial(tomanAmount) : null;
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
        method,
        amount: normalizedAmount,
        referenceNumber: toLatinDigits(reference.trim()) || undefined,
        file,
      });
      setOpen(false);
      setFile(null);
      setAmount('');
      setReference('');
      setDragging(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
        onClick={openSheet}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F59E0B] px-4 text-sm font-bold text-[#202124] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]"
      >
        <Upload className="h-4 w-4" aria-hidden />
        افزایش اعتبار
      </button>
      <InboxSheet
        open={open}
        title="افزایش اعتبار"
        onClose={closeSheet}
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
          مبلغ واریزی به حساب فروشنده را با رسید ارسال کنید. پس از تأیید حسابداری، اعتبار شما افزایش می‌یابد. این واریز به سفارش خاصی متصل نیست.
        </p>
        {error ? <p className="mb-3 text-sm text-[#DC2626]">{error}</p> : null}
        <label className="mb-3 block text-sm text-[#6B7280]">
          روش پرداخت
          <select className={fieldClass} value={method} onChange={(event) => setMethod(event.target.value)} aria-label="روش پرداخت">
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="mb-3 block text-sm text-[#6B7280]">
          مبلغ (تومان)
          <input
            className={fieldClass}
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            value={amount}
            onChange={(event) => setAmount(formatGroupedPersianInteger(event.target.value))}
            aria-label="مبلغ"
          />
        </label>
        <label className="mb-3 block text-sm text-[#6B7280]">
          شماره پیگیری
          <input
            className={fieldClass}
            type="text"
            name="referenceNumber"
            dir="ltr"
            inputMode="text"
            autoComplete="off"
            value={reference}
            onChange={(event) => setReference(toPersianDigits(event.target.value))}
            aria-label="شماره پیگیری"
          />
        </label>
        <div className="block text-sm text-[#6B7280]">
          فایل رسید
          <label
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              setDragging(true);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              applyFile(event.dataTransfer.files[0]);
            }}
            className={`mt-1 flex min-h-[7.5rem] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-3 py-4 text-center transition-colors ${
              dragging ? 'border-[#C8922E] bg-[#FFF8E7]' : 'border-[#E5E7EB] bg-[#F8F9FA]'
            }`}
          >
            {file ? <FileText className="h-7 w-7 text-[#C8922E]" aria-hidden /> : <Upload className="h-7 w-7 text-[#C8922E]" aria-hidden />}
            {file ? (
              <>
                <p className="mt-2 break-all text-sm font-semibold text-[#202124]">{file.name}</p>
                <p className="mt-1 text-xs text-[#6B7280]">{fileSizeLabel(file.size)}</p>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm font-semibold text-[#202124]">فایل را اینجا رها کنید</p>
                <p className="mt-1 text-xs leading-6 text-[#6B7280]">یا برای انتخاب از دستگاه کلیک کنید. JPG، PNG، WebP یا PDF تا ۱۰ مگابایت</p>
              </>
            )}
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept={RECEIPT_ACCEPT}
              aria-label="فایل رسید"
              onChange={(event) => {
                applyFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </label>
        </div>
      </InboxSheet>
    </>
  );
}

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${toPersianDigits(String(bytes))} بایت`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${toPersianDigits(kilobytes.toFixed(0))} کیلوبایت`;
  return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
}
