'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  FileText,
  Landmark,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { ApiClientError, paymentsApi } from '@/lib/api';
import { COMPANY_BANK_ACCOUNT } from '@/lib/company-bank-account';
import { tomanAmountWordsLabel } from '@/lib/toman-words';
import {
  cn,
  formatGroupedPersianInteger,
  toLatinDigits,
  tomanToRial,
  toPersianDigits,
} from '@/lib/utils';

const fieldClass =
  'mt-1 min-h-12 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]';

const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const RECEIPT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

const QUICK_TOMAN_CHIPS = [
  { label: '+۱ میلیون', toman: 1_000_000 },
  { label: '+۵ میلیون', toman: 5_000_000 },
  { label: '+۱۰ میلیون', toman: 10_000_000 },
  { label: '+۵۰ میلیون', toman: 50_000_000 },
  { label: '+۱۰۰ میلیون', toman: 100_000_000 },
  { label: '+۵۰۰ میلیون', toman: 500_000_000 },
] as const;

type DepositTab = 'bank' | 'online';

export function SubmitReceiptButton({
  onSubmitted,
  className,
  label = 'افزایش اعتبار',
}: {
  onSubmitted: () => void;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DepositTab>('bank');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    if (typeof URL.createObjectURL !== 'function') {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const latinAmount = toLatinDigits(amount).replace(/[^\d]/g, '');
  const wordsLabel = useMemo(() => tomanAmountWordsLabel(latinAmount), [latinAmount]);
  const canSubmitBank = Boolean(latinAmount && file && reference.trim() && !busy);

  const openSheet = () => {
    setError(null);
    setDragging(false);
    setTab('bank');
    setOpen(true);
  };

  const closeSheet = () => {
    if (busy) return;
    setOpen(false);
    setDragging(false);
  };

  const resetForm = () => {
    setFile(null);
    setAmount('');
    setReference('');
    setDragging(false);
    setError(null);
    setTab('bank');
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  const addQuickToman = (toman: number) => {
    const current = Number(latinAmount || '0');
    const next = (Number.isFinite(current) ? current : 0) + toman;
    setAmount(formatGroupedPersianInteger(String(next)));
  };

  const submit = async () => {
    setError(null);
    if (!file) {
      setError('فایل رسید را انتخاب کنید.');
      return;
    }
    const normalizedAmount = latinAmount ? tomanToRial(latinAmount) : null;
    if (!normalizedAmount) {
      setError('مبلغ را وارد کنید.');
      return;
    }
    if (!reference.trim()) {
      setError('شماره پیگیری برای این روش پرداخت لازم است.');
      return;
    }
    setBusy(true);
    try {
      await paymentsApi.submitReceipt({
        method: 'BANK_TRANSFER',
        amount: normalizedAmount,
        referenceNumber: toLatinDigits(reference.trim()) || undefined,
        file,
      });
      setOpen(false);
      resetForm();
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
        className={
          className ??
          'inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F59E0B] px-4 text-sm font-bold text-[#202124] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]'
        }
      >
        <Upload className="h-4 w-4" aria-hidden />
        {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <button
            type="button"
            className="absolute inset-0 z-0 bg-black/45 transition-opacity"
            aria-label="بستن"
            onClick={closeSheet}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deposit-modal-title"
            className="relative z-10 flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none animate-in fade-in zoom-in-95 duration-200 sm:rounded-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF4D6] text-[#C8922E]">
                    <Wallet className="h-5 w-5" aria-hidden />
                  </span>
                  <h2 id="deposit-modal-title" className="text-base font-bold text-gray-900 sm:text-lg">
                    افزایش اعتبار کیف پول
                  </h2>
                </div>
                <p className="mt-2 text-sm leading-7 text-gray-500">
                  لطفاً مبلغ واریزی خود را مشخص کنید. برای مبالغ بالا، از انتقال بانکی (پایا/ساتنا) استفاده نمایید.
                </p>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                aria-label="بستن"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-50 p-1.5">
                <TabButton
                  active={tab === 'bank'}
                  onClick={() => setTab('bank')}
                  icon={<Landmark className="h-4 w-4" aria-hidden />}
                  label="فیش بانکی (پایا / ساتنا / حواله)"
                />
                <TabButton
                  active={tab === 'online'}
                  onClick={() => setTab('online')}
                  icon={<CreditCard className="h-4 w-4" aria-hidden />}
                  label="پرداخت آنلاین شتابی (شارژ آنی)"
                />
              </div>

              {error ? (
                <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600" role="alert">
                  {error}
                </p>
              ) : null}

              {tab === 'bank' ? (
                <div className="mt-4 space-y-4">
                  <CompanyBankCard />

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      مبلغ واریزی (تومان)
                      <input
                        className={cn(fieldClass, 'text-base font-semibold')}
                        dir="ltr"
                        inputMode="numeric"
                        autoComplete="off"
                        value={amount}
                        onChange={(event) => setAmount(formatGroupedPersianInteger(event.target.value))}
                        aria-label="مبلغ"
                        placeholder="۰"
                      />
                    </label>
                    {wordsLabel ? (
                      <p className="mt-1.5 text-sm font-medium text-emerald-600">{wordsLabel}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {QUICK_TOMAN_CHIPS.map((chip) => (
                        <button
                          key={chip.toman}
                          type="button"
                          onClick={() => addQuickToman(chip.toman)}
                          className="inline-flex min-h-9 items-center rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:border-[#C8922E] hover:bg-[#FFF8E7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block text-sm font-medium text-gray-600">
                    شماره پیگیری / شماره ارجاع بانکی
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
                      placeholder="مثلاً ۸۴۹۲۰۱۹۴۸"
                    />
                  </label>

                  <div className="block text-sm font-medium text-gray-600">
                    فایل رسید
                    {file ? (
                      <div className="mt-1 flex items-center gap-3 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 px-3 py-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-white">
                          {previewUrl ? (
                            // Blob preview; next/image is not suitable for object URLs here.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <FileText className="h-6 w-6 text-[#C8922E]" aria-hidden />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">{file.name}</p>
                          <p className="mt-0.5 text-xs text-gray-500">{fileSizeLabel(file.size)}</p>
                          <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                            با موفقیت آپلود شد
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          حذف فایل
                        </button>
                      </div>
                    ) : (
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
                        className={cn(
                          'mt-1 flex min-h-[7.5rem] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-3 py-4 text-center transition-colors',
                          dragging ? 'border-[#C8922E] bg-[#FFF8E7]' : 'border-gray-200 bg-gray-50',
                        )}
                      >
                        <Upload className="h-7 w-7 text-[#C8922E]" aria-hidden />
                        <p className="mt-2 text-sm font-semibold text-gray-900">فایل را اینجا رها کنید</p>
                        <p className="mt-1 text-xs leading-6 text-gray-500">
                          یا برای انتخاب از دستگاه کلیک کنید. JPG، PNG، WebP یا PDF تا ۱۰ مگابایت
                        </p>
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
                    )}
                  </div>
                </div>
              ) : (
                <OnlineGatewayPanel amount={amount} onAmountChange={setAmount} onQuickAdd={addQuickToman} wordsLabel={wordsLabel} />
              )}
            </div>

            <footer className="border-t border-gray-100 px-5 py-4">
              {tab === 'bank' ? (
                <>
                  <p className="mb-3 flex items-start gap-2 text-xs leading-6 text-gray-500">
                    <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                    تأیید واریزهای پایا و ساتنا توسط واحد مالی ظرف ۱۵ الی ۳۰ دقیقه انجام می‌پذیرد.
                  </p>
                  <button
                    type="button"
                    disabled={!canSubmitBank}
                    onClick={() => void submit()}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#C8922E] text-sm font-bold text-white hover:bg-[#B27F1F] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]"
                  >
                    <CheckCircle2 className="h-5 w-5" aria-hidden />
                    {busy ? 'در حال ارسال…' : 'ثبت و ارسال رسید برای بررسی'}
                  </button>
                </>
              ) : (
                <p className="text-center text-xs leading-6 text-gray-500">
                  درگاه آنلاین به‌زودی فعال می‌شود؛ فعلاً از فیش بانکی استفاده کنید.
                </p>
              )}
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-2 text-center text-[11px] font-semibold leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E] sm:flex-row sm:gap-2 sm:text-xs sm:leading-5',
        active
          ? 'border border-[#E8C56A] bg-[#FFF4D6] text-[#8A6410] shadow-sm'
          : 'border border-transparent bg-transparent text-gray-500 hover:bg-white',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function CompanyBankCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-slate-500" aria-hidden />
        <p className="text-sm font-bold text-slate-800">{COMPANY_BANK_ACCOUNT.companyTitle}</p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
          Saman
        </span>
        <p className="text-sm font-semibold text-slate-800">{COMPANY_BANK_ACCOUNT.bankName}</p>
      </div>

      <div className="mt-3 space-y-2 text-sm">
        <CopyRow
          label="شماره شبا"
          value={COMPANY_BANK_ACCOUNT.ibanDisplay}
          copyValue={COMPANY_BANK_ACCOUNT.iban}
          buttonLabel="کپی شبا"
        />
        <CopyRow
          label="شماره حساب"
          value={COMPANY_BANK_ACCOUNT.accountNumber}
          copyValue={COMPANY_BANK_ACCOUNT.accountNumber}
          buttonLabel="کپی"
          compact
        />
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-slate-500">صاحب حساب</span>
          <span className="text-sm font-medium text-slate-800">{COMPANY_BANK_ACCOUNT.accountHolder}</span>
        </div>
      </div>
    </div>
  );
}

function CopyRow({
  label,
  value,
  copyValue,
  buttonLabel,
  compact,
}: {
  label: string;
  value: string;
  copyValue: string;
  buttonLabel: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/80 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500">{label}</p>
        <p className="mt-0.5 font-mono text-sm font-semibold tracking-wide text-slate-900" dir="ltr">
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        className={cn(
          'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          compact
            ? 'border border-slate-200 text-slate-600 hover:bg-slate-50'
            : 'bg-blue-600 text-white hover:bg-blue-700',
        )}
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        {copied ? 'کپی شد' : buttonLabel}
      </button>
    </div>
  );
}

function OnlineGatewayPanel({
  amount,
  onAmountChange,
  onQuickAdd,
  wordsLabel,
}: {
  amount: string;
  onAmountChange: (value: string) => void;
  onQuickAdd: (toman: number) => void;
  wordsLabel: string | null;
}) {
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center">
        <CreditCard className="mx-auto h-8 w-8 text-[#C8922E]" aria-hidden />
        <p className="mt-2 text-sm font-bold text-gray-900">شارژ آنی از درگاه شتاب</p>
        <p className="mt-1 text-xs leading-6 text-gray-500">
          برای مبالغ کوچک، پس از فعال‌سازی درگاه به صفحه بانک منتقل می‌شوید و اعتبار بلافاصله افزایش می‌یابد.
        </p>
      </div>

      <label className="block text-sm font-medium text-gray-600">
        مبلغ شارژ (تومان)
        <input
          className={cn(fieldClass, 'text-base font-semibold')}
          dir="ltr"
          inputMode="numeric"
          autoComplete="off"
          value={amount}
          onChange={(event) => onAmountChange(formatGroupedPersianInteger(event.target.value))}
          aria-label="مبلغ"
          placeholder="۰"
        />
      </label>
      {wordsLabel ? <p className="text-sm font-medium text-emerald-600">{wordsLabel}</p> : null}
      <div className="flex flex-wrap gap-2">
        {QUICK_TOMAN_CHIPS.slice(0, 4).map((chip) => (
          <button
            key={chip.toman}
            type="button"
            onClick={() => onQuickAdd(chip.toman)}
            className="inline-flex min-h-9 items-center rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:border-[#C8922E] hover:bg-[#FFF8E7]"
          >
            {chip.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gray-200 text-sm font-bold text-gray-500"
      >
        انتقال به درگاه (به‌زودی)
      </button>
    </div>
  );
}

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${toPersianDigits(String(bytes))} بایت`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${toPersianDigits(kilobytes.toFixed(0))} کیلوبایت`;
  return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
}
