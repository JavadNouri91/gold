'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CheckCircle2,
  Plus,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { nextPayaCycleLabel } from '@/lib/paya-cycle';
import { tomanAmountWordsLabel } from '@/lib/toman-words';
import { DAILY_PAYA_LIMIT_RIAL } from '@/lib/verified-bank-accounts';
import {
  exceedsAvailableBalance,
  percentOfAvailableToman,
  remainingAfterWithdrawRial,
} from '@/lib/withdraw-amount';
import {
  ApiClientError,
  customerApi,
  paymentsApi,
  type CustomerBankAccount,
} from '@/lib/api';
import { formatIbanDisplay } from '@/lib/iban-bank';
import { BankLogo } from '@/components/portal/profile/bank-logo';
import {
  cn,
  formatGroupedPersianInteger,
  formatMoney,
  formatWholeMoney,
  toLatinDigits,
  tomanToRial,
  toPersianDigits,
} from '@/lib/utils';

const fieldClass =
  'mt-1 min-h-12 w-full rounded-xl border border-gray-300 bg-white px-3 text-base font-semibold text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600';

type Step = 'form' | 'otp' | 'done';

/**
 * کلید موقت: ارسال واقعی پیامک کد امنیتی (SMS) غیرفعال است، ولی روند درخواست برداشت
 * کامل کار می‌کند و کاربر بدون دریافت پیامک می‌تواند مرحله کد امنیتی را تأیید کند.
 * برای فعال‌سازی ارسال پیامک، مقدار را true کنید.
 */
const SMS_DELIVERY_ENABLED = false;

export function WithdrawRequestButton({
  availableRial,
  className,
  label = 'درخواست برداشت وجه',
  onRequested,
  open: openProp,
  onOpenChange,
}: {
  availableRial?: string | null;
  className?: string;
  label?: string;
  onRequested?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600'
        }
      >
        <ArrowUpRight className="h-4 w-4" aria-hidden />
        {label}
      </button>
      <WithdrawRequestModal
        open={open}
        onClose={() => setOpen(false)}
        availableRial={availableRial}
        onRequested={() => {
          onRequested?.();
        }}
      />
    </>
  );
}

export function WithdrawRequestModal({
  open,
  onClose,
  availableRial,
  onRequested,
}: {
  open: boolean;
  onClose: () => void;
  availableRial?: string | null;
  onRequested?: () => void;
}) {
  const [step, setStep] = useState<Step>('form');
  const [accounts, setAccounts] = useState<CustomerBankAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    setStep('form');
    setAmount('');
    setOtp('');
    setError(null);
    setBusy(false);
    setAccounts([]);
    setAccountId('');

    let cancelled = false;
    setAccountsLoading(true);
    void customerApi
      .listMyBankAccounts()
      .then((rows) => {
        if (cancelled) return;
        setAccounts(rows);
        setAccountId(rows[0]?.id ?? '');
      })
      .catch(() => {
        if (!cancelled) setError('دریافت شبای‌های تأییدشده انجام نشد.');
      })
      .finally(() => {
        if (!cancelled) setAccountsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const latinAmount = toLatinDigits(amount).replace(/[^\d]/g, '');
  const wordsLabel = useMemo(() => tomanAmountWordsLabel(latinAmount), [latinAmount]);
  const exceeds = exceedsAvailableBalance(availableRial ?? null, latinAmount);
  const remainingRial =
    availableRial && latinAmount && !exceeds
      ? remainingAfterWithdrawRial(availableRial, latinAmount)
      : null;
  const selected = accounts.find((account) => account.id === accountId) ?? null;
  const canRequestOtp = Boolean(
    selected && latinAmount && !exceeds && Number(latinAmount) > 0 && !busy,
  );

  const applyPercent = (percent: number) => {
    if (!availableRial) return;
    const toman = percentOfAvailableToman(availableRial, percent);
    setAmount(formatGroupedPersianInteger(toman));
    setError(null);
  };

  const close = () => {
    if (busy) return;
    onClose();
  };

  const sendOtp = () => {
    setError(null);
    if (!canRequestOtp) {
      setError(exceeds ? 'مبلغ واردشده از موجودی قابل برداشت بیشتر است.' : 'مبلغ و حساب مقصد را بررسی کنید.');
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      setStep('otp');
      setOtp('');
    }, 450);
  };

  const confirmOtp = () => {
    setError(null);
    const code = toLatinDigits(otp).replace(/\D/g, '');
    // وقتی ارسال پیامک غیرفعال است، کدی به کاربر نمی‌رسد و تأیید بدون کد انجام می‌شود.
    if (SMS_DELIVERY_ENABLED && code.length < 5) {
      setError('کد امنیتی پیامکی را کامل وارد کنید.');
      return;
    }
    if (!selected) {
      setError('حساب مقصد را انتخاب کنید.');
      return;
    }
    const rialAmount = tomanToRial(latinAmount);
    if (!rialAmount) {
      setError('مبلغ را بررسی کنید.');
      return;
    }
    setBusy(true);
    void paymentsApi
      .requestWithdrawal({ amount: rialAmount, bankAccountId: selected.id })
      .then(() => {
        setBusy(false);
        setStep('done');
        onRequested?.();
      })
      .catch((err: unknown) => {
        setBusy(false);
        setError(
          err instanceof ApiClientError || err instanceof Error ? err.message : 'ثبت درخواست برداشت انجام نشد.',
        );
      });
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
        <button type="button" className="absolute inset-0 z-0 bg-black/45" aria-label="بستن" onClick={close} />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="withdraw-modal-title"
          className="relative z-10 flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none animate-in fade-in zoom-in-95 duration-200 sm:rounded-2xl"
        >
          <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <ArrowUpRight className="h-5 w-5" aria-hidden />
                </span>
                <h2 id="withdraw-modal-title" className="text-base font-bold text-gray-900 sm:text-lg">
                  درخواست برداشت وجه
                </h2>
              </div>
              <p className="mt-2 text-sm leading-7 text-gray-500">
                مبلغ به شبای تأییدشده بنام خودتان واریز می‌شود. مبلغ درخواستی بلافاصله رزرو و از موجودی قابل برداشت کسر می‌گردد.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="بستن"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {step === 'form' ? (
              <FormStep
                availableRial={availableRial}
                accounts={accounts}
                accountsLoading={accountsLoading}
                accountId={accountId}
                onAccountId={setAccountId}
                amount={amount}
                onAmount={(value) => {
                  setAmount(formatGroupedPersianInteger(value));
                  setError(null);
                }}
                wordsLabel={wordsLabel}
                exceeds={exceeds}
                remainingRial={remainingRial}
                latinAmount={latinAmount}
                onPercent={applyPercent}
                error={error}
              />
            ) : null}

            {step === 'otp' ? (
              <OtpStep
                selected={selected}
                amountLabel={latinAmount ? formatMoney(tomanToRial(latinAmount)) : '—'}
                otp={otp}
                onOtp={(value) => setOtp(toPersianDigits(value.replace(/[^\d۰-۹٠-٩]/g, '').slice(0, 6)))}
                error={error}
              />
            ) : null}

            {step === 'done' ? (
              <DoneStep
                amountLabel={latinAmount ? formatMoney(tomanToRial(latinAmount)) : '—'}
                selected={selected}
              />
            ) : null}
          </div>

          <footer className="border-t border-gray-100 px-5 py-4">
            {step === 'form' ? (
              <>
                <p className="mb-3 flex items-start gap-2 text-xs leading-6 text-gray-500">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                  برداشت وجه صرفاً به حساب‌های تاییدشده بنام کاربر انجام می‌پذیرد.
                </p>
                <button
                  type="button"
                  disabled={!canRequestOtp}
                  onClick={sendOtp}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  <ShieldCheck className="h-5 w-5" aria-hidden />
                  {busy ? (SMS_DELIVERY_ENABLED ? 'در حال ارسال…' : 'در حال آماده‌سازی…') : 'تأیید و ارسال کد امنیتی پیامکی (OTP)'}
                </button>
                {SMS_DELIVERY_ENABLED ? null : (
                  <p className="mt-2 text-xs leading-6 text-amber-700" role="status">
                    ارسال پیامک موقتاً غیرفعال است؛ درخواست برداشت بدون دریافت پیامک ثبت می‌شود.
                  </p>
                )}
              </>
            ) : null}

            {step === 'otp' ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setStep('form')}
                  className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  بازگشت
                </button>
                <button
                  type="button"
                  disabled={busy || (SMS_DELIVERY_ENABLED && toLatinDigits(otp).replace(/\D/g, '').length < 5)}
                  onClick={confirmOtp}
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-45"
                >
                  <CheckCircle2 className="h-5 w-5" aria-hidden />
                  {busy ? 'در حال ثبت…' : 'تأیید نهایی برداشت'}
                </button>
              </div>
            ) : null}

            {step === 'done' ? (
              <button
                type="button"
                onClick={close}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700"
              >
                بستن
              </button>
            ) : null}
          </footer>
        </div>
      </div>
    </>
  );
}

function FormStep({
  availableRial,
  accounts,
  accountsLoading,
  accountId,
  onAccountId,
  amount,
  onAmount,
  wordsLabel,
  exceeds,
  remainingRial,
  latinAmount,
  onPercent,
  error,
}: {
  availableRial?: string | null;
  accounts: CustomerBankAccount[];
  accountsLoading: boolean;
  accountId: string;
  onAccountId: (id: string) => void;
  amount: string;
  onAmount: (value: string) => void;
  wordsLabel: string | null;
  exceeds: boolean;
  remainingRial: string | null;
  latinAmount: string;
  onPercent: (percent: number) => void;
  error: string | null;
}) {
  const payaLabel = useMemo(() => nextPayaCycleLabel(), []);

  return (
    <div className="space-y-4">
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm">
            <Wallet className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-900">موجودی قابل برداشت کیف پول</p>
            <p className="mt-1 text-xl font-bold text-emerald-950">
              {availableRial != null ? formatWholeMoney(availableRial) : '—'}
            </p>
            <p className="mt-2 inline-flex rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
              سقف برداشت روزانه پایا: {formatMoney(DAILY_PAYA_LIMIT_RIAL)}
            </p>
          </div>
        </div>
      </article>

      <section>
        <h3 className="text-sm font-bold text-gray-900">حساب مقصد (تأییدشده)</h3>
        <div className="mt-2">
          {accountsLoading ? (
            <p className="rounded-2xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
              در حال دریافت شبای‌های تأییدشده…
            </p>
          ) : accounts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center">
              <p className="text-sm leading-7 text-gray-600">
                هنوز شماره شبای تأییدشده‌ای ثبت نکرده‌اید.
              </p>
              <Link
                href="/portal/profile"
                className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" aria-hidden />
                ثبت شماره شبا در پروفایل
              </Link>
            </div>
          ) : (
            <div className="space-y-2" role="radiogroup" aria-label="حساب بانکی مقصد">
              {accounts.map((account) => (
                <BankAccountOption
                  key={account.id}
                  account={account}
                  selected={accountId === account.id}
                  onSelect={() => onAccountId(account.id)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <div>
        <label className="block text-sm font-medium text-gray-600">
          مبلغ برداشت (تومان)
          <input
            className={cn(fieldClass, exceeds && 'border-rose-400 focus-visible:ring-rose-500')}
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            value={amount}
            onChange={(event) => onAmount(event.target.value)}
            aria-label="مبلغ برداشت"
            placeholder="۰"
          />
        </label>
        {wordsLabel && !exceeds ? (
          <p className="mt-1.5 text-sm font-medium text-emerald-600">{wordsLabel}</p>
        ) : null}
        {exceeds ? (
          <p className="mt-1.5 text-sm font-medium text-rose-600" role="alert">
            مبلغ واردشده از موجودی قابل برداشت بیشتر است.
          </p>
        ) : null}
        {error ? (
          <p className="mt-1.5 text-sm text-rose-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {[25, 50, 75].map((percent) => (
            <button
              key={percent}
              type="button"
              onClick={() => onPercent(percent)}
              className="inline-flex min-h-9 items-center rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:border-emerald-500 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              {toPersianDigits(String(percent))}٪
            </button>
          ))}
          <button
            type="button"
            onClick={() => onPercent(100)}
            className="inline-flex min-h-9 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            برداشت کل موجودی
          </button>
        </div>
      </div>

      {latinAmount && !exceeds && Number(latinAmount) > 0 ? (
        <InvoicePreview
          requestAmountRial={tomanToRial(latinAmount) ?? '0'}
          remainingRial={remainingRial}
          payaLabel={payaLabel}
        />
      ) : null}
    </div>
  );
}

function BankAccountOption({
  account,
  selected,
  onSelect,
}: {
  account: CustomerBankAccount;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border p-3 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600',
        selected ? 'border-emerald-500 bg-emerald-50/70 ring-1 ring-emerald-500' : 'border-gray-200 bg-white hover:bg-gray-50',
      )}
    >
      <BankLogo iban={account.iban} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-gray-900">{account.bankName ?? 'حساب بانکی'}</p>
        <p className="mt-0.5 font-mono text-xs text-gray-500" dir="ltr">
          {formatIbanDisplay(account.iban)}
        </p>
        <p className="mt-0.5 text-xs text-gray-600">صاحب حساب: {account.accountHolder}</p>
      </div>
      <span
        className={cn(
          'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 bg-white',
        )}
        aria-hidden
      >
        {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
      </span>
    </button>
  );
}

function InvoicePreview({
  requestAmountRial,
  remainingRial,
  payaLabel,
}: {
  requestAmountRial: string;
  remainingRial: string | null;
  payaLabel: string;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-slate-50/80 p-4 shadow-sm">
      <h3 className="text-sm font-bold text-gray-900">خلاصه تسویه</h3>
      <dl className="mt-3 space-y-2.5 text-sm">
        <Row label="مبلغ درخواستی" value={formatMoney(requestAmountRial)} />
        <Row label="کارمزد انتقال" value="رایگان" valueClass="text-emerald-700" />
        <Row label="مبلغ نهایی واریزی به شبا" value={formatMoney(requestAmountRial)} bold />
        <div className="rounded-xl bg-white px-3 py-2.5">
          <dt className="text-xs text-gray-500">زمانبندی واریز</dt>
          <dd className="mt-1 text-sm font-medium leading-6 text-gray-800">{payaLabel}</dd>
        </div>
        <Row
          label="باقیمانده کیف پول پس از برداشت"
          value={remainingRial != null ? formatWholeMoney(remainingRial) : '—'}
        />
      </dl>
    </section>
  );
}

function Row({
  label,
  value,
  bold,
  valueClass,
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className={cn('font-semibold text-gray-900', bold && 'text-base', valueClass)}>{value}</dd>
    </div>
  );
}

function OtpStep({
  selected,
  amountLabel,
  otp,
  onOtp,
  error,
}: {
  selected: CustomerBankAccount | null;
  amountLabel: string;
  otp: string;
  onOtp: (value: string) => void;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm leading-7 text-emerald-900">
        {SMS_DELIVERY_ENABLED
          ? 'کد امنیتی به شماره موبایل ثبت‌شده شما ارسال شد. برای تکمیل برداشت، کد را وارد کنید.'
          : 'ارسال پیامک موقتاً غیرفعال است؛ برای تکمیل درخواست برداشت، نیازی به وارد کردن کد نیست و می‌توانید مستقیم تأیید کنید.'}
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm">
        <p className="text-gray-500">مبلغ</p>
        <p className="mt-1 font-bold text-gray-900">{amountLabel}</p>
        {selected ? (
          <>
            <p className="mt-3 text-gray-500">مقصد</p>
            <p className="mt-1 font-semibold text-gray-900">
              {selected.bankName ?? 'حساب بانکی'} — {formatIbanDisplay(selected.iban)}
            </p>
          </>
        ) : null}
      </div>
      <label className="block text-sm font-medium text-gray-600">
        {SMS_DELIVERY_ENABLED ? 'کد امنیتی پیامکی' : 'کد امنیتی پیامکی (اختیاری)'}
        <input
          className={cn(fieldClass, 'tracking-[0.35em]')}
          dir="ltr"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={otp}
          onChange={(event) => onOtp(event.target.value)}
          aria-label="کد امنیتی پیامکی"
          placeholder="------"
        />
      </label>
      {error ? (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DoneStep({
  amountLabel,
  selected,
}: {
  amountLabel: string;
  selected: CustomerBankAccount | null;
}) {
  return (
    <div className="py-6 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <CheckCircle2 className="h-8 w-8" aria-hidden />
      </span>
      <h3 className="mt-4 text-base font-bold text-gray-900">درخواست برداشت ثبت شد</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-7 text-gray-500">
        مبلغ {amountLabel}
        {selected ? ` به ${selected.bankName ?? 'حساب بانکی'} (${formatIbanDisplay(selected.iban)})` : ''} رزرو شد و
        پس از تأیید مالی در سیکل پایا واریز می‌شود.
      </p>
    </div>
  );
}
