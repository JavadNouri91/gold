'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Check, CreditCard, Landmark, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { customerApi, type CustomerBankAccount } from '@/lib/api';
import { formatIbanDisplay, ibanBankName } from '@/lib/iban-bank';
import {
  DEMO_VERIFIED_BANK_ACCOUNTS,
  type VerifiedBankAccount,
} from '@/lib/verified-bank-accounts';
import { cn } from '@/lib/utils';
import { AddIbanModal, type AddIbanResult } from './add-iban-modal';
import { BankLogo } from './bank-logo';

type BankAccountView = {
  id: string;
  iban: string;
  bankName: string;
  accountHolder: string;
};

function toView(account: CustomerBankAccount | VerifiedBankAccount): BankAccountView {
  return {
    id: account.id,
    iban: account.iban,
    bankName: account.bankName ?? '',
    accountHolder: account.accountHolder,
  };
}

export function BankAccountsCard({
  holderName,
  showDemoAccounts = false,
}: {
  customerId?: string;
  holderName?: string;
  showDemoAccounts?: boolean;
}) {
  const [demoAccounts, setDemoAccounts] = useState<BankAccountView[]>(() =>
    showDemoAccounts ? DEMO_VERIFIED_BANK_ACCOUNTS.map(toView) : [],
  );
  const [open, setOpen] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR(
    showDemoAccounts ? null : 'customers/me/bank-accounts',
    () => customerApi.listMyBankAccounts(),
  );

  const accounts: BankAccountView[] = showDemoAccounts
    ? demoAccounts
    : (data ?? []).map(toView);

  const removeTarget = accounts.find((item) => item.id === removeId) ?? null;
  const displayName = holderName?.trim() || 'کاربر';
  const description = holderName?.trim()
    ? `برای برداشت وجه و تسویه ریالی، ثبت حداقل یک شماره شبا به نام خودتان (${holderName.trim()}) الزامی است.`
    : 'برای برداشت وجه و تسویه ریالی، ثبت حداقل یک شماره شبا به نام خودتان الزامی است.';

  const handleAdd = async (result: AddIbanResult) => {
    const iban = result.iban.replace(/\s/g, '').toUpperCase();
    setActionError(null);
    if (showDemoAccounts) {
      setDemoAccounts((prev) => {
        if (prev.some((item) => item.iban === iban)) return prev;
        return [
          {
            id: `acc-${iban}`,
            iban,
            bankName: result.bankName ?? ibanBankName(iban) ?? '',
            accountHolder: result.accountHolder,
          },
          ...prev,
        ];
      });
      return;
    }
    setSaving(true);
    try {
      await customerApi.createMyBankAccount(iban);
      await mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'ثبت شماره شبا انجام نشد');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setActionError(null);
    if (showDemoAccounts) {
      setDemoAccounts((prev) => prev.filter((item) => item.id !== removeTarget.id));
      setRemoveId(null);
      return;
    }
    setSaving(true);
    try {
      await customerApi.deleteMyBankAccount(removeTarget.id);
      await mutate();
      setRemoveId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'حذف شماره شبا انجام نشد');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-6" dir="rtl">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <Landmark className="h-5 w-5 text-amber-600" aria-hidden />
          حساب‌های بانکی
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      </div>

      {actionError ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      ) : null}
      {error && !showDemoAccounts ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          خطا در بارگذاری حساب‌های بانکی
        </p>
      ) : null}

      {isLoading && !showDemoAccounts && !data ? (
        <p className="mt-5 text-sm text-slate-400">در حال بارگذاری…</p>
      ) : accounts.length === 0 ? (
        <EmptyBankAccounts onAdd={() => setOpen(true)} />
      ) : (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {accounts.map((account) => (
              <BankAccountCard
                key={account.id}
                account={account}
                onRemove={() => setRemoveId(account.id)}
              />
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-1.5 border-amber-300 text-amber-700 hover:border-amber-400 hover:bg-amber-50"
            onClick={() => setOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            افزودن حساب بانکی جدید
          </Button>
        </div>
      )}

      <AddIbanModal
        open={open}
        onClose={() => setOpen(false)}
        holderName={displayName}
        onSubmit={handleAdd}
      />

      <Modal
        open={Boolean(removeTarget)}
        onClose={() => setRemoveId(null)}
        title="حذف حساب بانکی"
      >
        <p className="text-sm leading-7 text-muted-foreground">
          {removeTarget
            ? `شماره شبا ${formatIbanDisplay(removeTarget.iban)} حذف شود؟`
            : null}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setRemoveId(null)}>
            انصراف
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-red-200 text-red-700 hover:bg-red-50"
            disabled={saving}
            onClick={() => void handleRemove()}
          >
            حذف حساب
          </Button>
        </div>
      </Modal>
    </section>
  );
}

function EmptyBankAccounts({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-5 rounded-xl bg-slate-50 p-6">
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <CreditCard className="h-7 w-7" aria-hidden />
        </span>
        <p className="mt-4 text-sm font-medium text-slate-500">
          حساب بانکی تأییدشده‌ای ثبت نشده است.
        </p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
          در حال حاضر هیچ حسابی برای واریز و تسویه ریالی متصل نیست.
        </p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className={cn(
          'mt-4 inline-flex w-full min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300',
          'bg-white text-sm font-semibold text-amber-700 transition',
          'hover:border-amber-400 hover:bg-amber-50',
        )}
      >
        <Plus className="h-4 w-4" aria-hidden />
        افزودن شماره شبا
      </button>
    </div>
  );
}

function BankAccountCard({
  account,
  onRemove,
}: {
  account: BankAccountView;
  onRemove: () => void;
}) {
  return (
    <article className="relative rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={onRemove}
        className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
        aria-label={`حذف شبا ${formatIbanDisplay(account.iban)}`}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>

      <div className="flex min-w-0 items-start gap-3 pe-8">
        <BankLogo iban={account.iban} />
        <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {ibanBankName(account.iban) || account.bankName ? (
            <h3 className="text-sm font-bold text-slate-900">
              {ibanBankName(account.iban) ?? account.bankName}
            </h3>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            <Check className="h-3 w-3" aria-hidden />
            تایید شده
          </span>
        </div>
        <p className="mt-3 text-xs text-slate-500">شماره شبا</p>
        <p className="mt-1 font-mono text-base font-bold tracking-wide text-slate-900" dir="ltr">
          {formatIbanDisplay(account.iban)}
        </p>
        <p className="mt-3 text-sm text-slate-700">
          {account.accountHolder}
          <span className="ms-2 text-xs font-normal text-slate-400">به نام کاربر</span>
        </p>
        </div>
      </div>
    </article>
  );
}
