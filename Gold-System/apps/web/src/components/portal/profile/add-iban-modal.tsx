'use client';

import { useEffect, useId, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { formatIbanDigitGroups, ibanBankName, ibanDigits } from '@/lib/iban-bank';
import { BankLogo } from './bank-logo';
import { cn, toPersianDigits } from '@/lib/utils';

const IBAN_DIGIT_COUNT = 24;

export type AddIbanResult = {
  iban: string;
  accountHolder: string;
  bankName: string | null;
};

function extractIbanDigits(value: string): string {
  return ibanDigits(value).slice(0, IBAN_DIGIT_COUNT);
}

export function AddIbanModal({
  open,
  onClose,
  holderName,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  holderName: string;
  onSubmit: (account: AddIbanResult) => void;
}) {
  const inputId = useId();
  const [digits, setDigits] = useState('');

  useEffect(() => {
    if (!open) setDigits('');
  }, [open]);

  const isIbanValid = digits.length === IBAN_DIGIT_COUNT;
  const displayValue = formatIbanDigitGroups(digits);
  const displayName = holderName.trim() || 'کاربر';
  const bankName = isIbanValid ? ibanBankName(`IR${digits}`) : null;

  const handleSubmit = () => {
    if (!isIbanValid) return;
    onSubmit({
      iban: `IR${digits}`,
      accountHolder: displayName,
      bankName,
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} className="max-w-md p-0 overflow-hidden">
      <div dir="rtl" className="flex max-h-[min(90vh,36rem)] flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 id="modal-title" className="text-base font-bold text-slate-900">
            افزودن شماره شبا جدید
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="بستن"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm leading-6 text-amber-800"
          >
            توجه: حساب بانکی باید حتماً به نام خودتان باشد. هویت تأییدشده شما:{' '}
            <span className="font-bold">{displayName}</span>.
          </div>

          <div>
            <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
              شماره شبا (IBAN)
            </label>
            <div
              className={cn(
                'mt-2 flex items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white transition',
                'focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500',
              )}
              dir="ltr"
            >
              <span className="inline-flex items-center bg-slate-50 px-3 text-sm font-bold text-slate-600">
                IR
              </span>
              <input
                id={inputId}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                placeholder="12 0560 0842 0000 1234 5678 90"
                value={displayValue}
                onChange={(event) => setDigits(extractIbanDigits(event.target.value))}
                className="min-w-0 flex-1 border-0 bg-transparent px-3 py-3 font-mono text-sm text-slate-900 outline-none placeholder:text-slate-300"
                aria-invalid={digits.length > 0 && !isIbanValid}
                aria-describedby={isIbanValid ? 'iban-lookup-result' : undefined}
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              {toPersianDigits(String(digits.length))}/{toPersianDigits(String(IBAN_DIGIT_COUNT))} رقم
            </p>
          </div>

          {isIbanValid ? (
            <div
              id="iban-lookup-result"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5"
              aria-live="polite"
            >
              <div className="flex items-start gap-3">
                <BankLogo iban={`IR${digits}`} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">
                      {bankName ?? 'شماره شبا معتبر است'}
                    </p>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      تطابق هویت ✓
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">صاحب حساب: {displayName}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            انصراف
          </Button>
          <Button
            type="button"
            disabled={!isIbanValid}
            onClick={handleSubmit}
            className={cn(
              'bg-emerald-600 text-white hover:bg-emerald-700',
              !isIbanValid && 'cursor-not-allowed opacity-50',
            )}
          >
            تایید و ثبت شماره شبا
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
