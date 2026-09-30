'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { customerApi, type CustomerAccount } from '@/lib/api';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { friendlyApiMessage } from './friendly-message';

const BLOCKED_MESSAGE =
  'به دلیل وجود سوابق مالی و معاملاتی، حذف مستقیم حساب امکان‌پذیر نیست. لطفاً با پشتیبانی تماس بگیرید.';

export function accountLooksFinancial(
  account: CustomerAccount | null | undefined,
  orderCount: number | null,
  tradeCount: number | null,
): boolean {
  if ((orderCount ?? 0) > 0 || (tradeCount ?? 0) > 0) return true;
  if (!account) return false;
  return [
    account.creditLimitRial,
    account.reservedCreditRial,
    account.consumedCreditRial,
    account.creditLimitGoldRial,
    account.reservedCreditGoldRial,
    account.consumedCreditGoldRial,
  ].some((value) => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0;
  });
}

export function DeleteAccountCard({
  account,
  orderCount,
  tradeCount,
  countsLoading,
  variant = 'panel',
}: {
  account?: CustomerAccount | null;
  orderCount: number | null;
  tradeCount: number | null;
  countsLoading?: boolean;
  variant?: 'panel' | 'embedded';
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const blocked = accountLooksFinancial(account, orderCount, tradeCount);

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setResult(null);
    setError(null);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await customerApi.requestDeletion();
      setResult(response.message);
    } catch (err) {
      setError(friendlyApiMessage(err, 'ثبت درخواست حذف انجام نشد. لطفاً دوباره تلاش کنید.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="delete-account"
      className={
        variant === 'embedded'
          ? 'scroll-mt-24 rounded-xl border border-red-100 bg-[#FEF2F2] p-4'
          : 'scroll-mt-24 rounded-2xl border border-red-100 bg-red-50/70 p-5 shadow-sm'
      }
    >
      <h2 className="flex items-center gap-2 text-[15px] font-bold text-[#DC2626]">
        <Trash2 className="h-4 w-4" aria-hidden />
        حذف حساب کاربری
      </h2>
      <p className={`text-sm leading-7 text-[#7F1D1D]/80 ${variant === 'embedded' ? 'mt-2' : 'mt-3'}`}>
        {variant === 'embedded'
          ? 'با حذف حساب، اطلاعات و دسترسی‌های حساب شما از سامانه حذف خواهد شد.'
          : 'با حذف حساب، اطلاعات و دسترسی‌های حساب شما از سامانه حذف یا غیرفعال خواهد شد.'}
      </p>
      <Button
        type="button"
        variant="destructive"
        className="mt-4 bg-[#DC2626] hover:bg-[#B91C1C]"
        onClick={() => {
          setResult(null);
          setError(null);
          setOpen(true);
        }}
      >
        درخواست حذف حساب
      </Button>

      <Modal open={open} onClose={close} title="درخواست حذف حساب">
        <p className="text-sm leading-7 text-muted-foreground">
          این درخواست حساب را بلافاصله حذف نمی‌کند. در صورت وجود سفارش، معامله، پرداخت یا اعتبار،
          حذف مستقیم ممکن نیست.
        </p>
        {countsLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">در حال بررسی سوابق حساب…</p>
        ) : null}
        {blocked ? (
          <Alert variant="warning" className="mt-4">
            {BLOCKED_MESSAGE}
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="error" className="mt-4">
            {error}
          </Alert>
        ) : null}
        {result ? (
          <Alert variant="success" className="mt-4">
            {result}
          </Alert>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close} disabled={submitting}>
            بستن
          </Button>
          {!blocked && !result && !countsLoading ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => void submit()}
              isLoading={submitting}
            >
              ثبت درخواست
            </Button>
          ) : null}
        </div>
      </Modal>
    </section>
  );
}
