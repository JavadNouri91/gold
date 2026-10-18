'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileInput, MobileNumber } from '@/components/ui/mobile-input';
import { ApiClientError } from '@/lib/api';
import { internalCustomersApi, internalPaymentsApi, type StaffCustomer } from '@/lib/internal-api';
import {
  PAYMENT_METHOD_LABELS,
  formatGroupedPersianInteger,
  isValidMobile,
  latinMobile,
  toLatinDigits,
  tomanToRial,
  toPersianDigits,
} from '@/lib/utils';

const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const RECEIPT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export function InPersonReceiptForm({ onRecorded }: { onRecorded: () => void }) {
  const [mobile, setMobile] = useState('');
  const [customer, setCustomer] = useState<StaffCustomer | null>(null);
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const lookup = async () => {
    setError(null);
    const normalized = latinMobile(mobile);
    if (!isValidMobile(normalized)) {
      setError('شماره موبایل مشتری را وارد کنید.');
      return;
    }
    setLookingUp(true);
    try {
      const result = await internalCustomersApi.list({ search: normalized, limit: 8 });
      const match =
        result.items.find((row) => latinMobile(row.mobile) === normalized) ?? result.items[0] ?? null;
      if (!match) {
        setCustomer(null);
        setError('مشتری با این شماره پیدا نشد.');
        return;
      }
      setCustomer(match);
    } catch (err) {
      setCustomer(null);
      setError(err instanceof ApiClientError ? err.message : 'جستجوی مشتری انجام نشد.');
    } finally {
      setLookingUp(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!customer) {
      setError('ابتدا مشتری را با شماره موبایل پیدا کنید.');
      return;
    }
    if (!file) {
      setError('فایل یا عکس فیش را انتخاب کنید.');
      return;
    }
    const tomanAmount = toLatinDigits(amount).replace(/[^\d.]/g, '');
    const rialAmount = tomanAmount ? tomanToRial(tomanAmount) : null;
    if (!rialAmount) {
      setError('مبلغ را وارد کنید.');
      return;
    }
    if (method !== 'CASH' && !reference.trim()) {
      setError('شماره پیگیری برای این روش پرداخت لازم است.');
      return;
    }
    setBusy(true);
    try {
      await internalPaymentsApi.submitInPersonReceipt({
        customerId: customer.id,
        method,
        amount: rialAmount,
        referenceNumber: toLatinDigits(reference.trim()) || undefined,
        notes: notes.trim() || undefined,
        file,
      });
      setFile(null);
      setAmount('');
      setReference('');
      setNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      onRecorded();
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : 'ثبت فیش انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold">ثبت فیش حضوری</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          اگر مشتری فیش واریزی را در فروشگاه تحویل می‌دهد، اینجا مشتری را پیدا کنید و عکس فیش را ثبت کنید. پس از تأیید حسابداری، اعتبار مشتری افزایش می‌یابد.
        </p>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <MobileInput
          id="in-person-customer-mobile"
          label="موبایل مشتری"
          value={mobile}
          onValueChange={(value) => {
            setMobile(value);
            setCustomer(null);
          }}
        />
        <div className="flex items-end">
          <Button type="button" variant="outline" isLoading={lookingUp} onClick={() => void lookup()}>
            یافتن مشتری
          </Button>
        </div>
      </div>
      {customer ? (
        <p className="text-sm">
          مشتری انتخاب‌شده: {customer.fullName} — <MobileNumber value={customer.mobile} />
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          روش
          <select
            className="mt-1 h-10 w-full rounded-md border px-3"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            aria-label="روش پرداخت"
          >
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Input
          id="in-person-amount"
          label="مبلغ (تومان)"
          dir="ltr"
          inputMode="numeric"
          autoComplete="off"
          value={amount}
          onChange={(event) => setAmount(formatGroupedPersianInteger(event.target.value))}
        />
        <Input
          id="in-person-reference"
          label="شماره پیگیری"
          dir="ltr"
          autoComplete="off"
          value={reference}
          onChange={(event) => setReference(toPersianDigits(event.target.value))}
        />
        <Input
          id="in-person-notes"
          label="یادداشت"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <label className="text-sm md:col-span-2">
          فایل فیش
          <input
            ref={fileInputRef}
            className="mt-1 block w-full text-sm"
            type="file"
            accept={RECEIPT_ACCEPT}
            aria-label="فایل فیش"
            onChange={(event) => {
              applyFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          {file ? <p className="mt-1 text-xs text-muted-foreground">{file.name}</p> : null}
        </label>
      </div>
      <Button isLoading={busy} onClick={() => void submit()}>
        ثبت فیش حضوری
      </Button>
    </div>
  );
}
