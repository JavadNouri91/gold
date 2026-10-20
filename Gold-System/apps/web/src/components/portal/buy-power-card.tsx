'use client';

import useSWR from 'swr';
import { ApiClientError, customerApi, type CurrentPrice } from '@/lib/api';
import { buyableGoldGrams } from '@/lib/buyable-gold';
import { readAvailableCredit } from '@/lib/credit-view';
import { formatWholeMoney, formatWeight } from '@/lib/utils';

const ACCOUNT_KEY = 'customer/me/account';

export function BuyPowerCard({ price }: { price?: CurrentPrice }) {
  const { data: account, error, isLoading } = useSWR(ACCOUNT_KEY, () => customerApi.getMyAccount());
  const loading = isLoading && !account;
  const unavailable = error instanceof ApiClientError && error.isNotFound;
  const failed = Boolean(error) && !unavailable;

  const livePrice = price?.normalizedValue;
  const hasLivePrice = Boolean(livePrice && Number(livePrice) > 0);
  const available = account ? readAvailableCredit(account) : null;
  const grams = hasLivePrice ? buyableGoldGrams(available, livePrice) : null;

  let message: string | null = null;
  if (!loading && failed) message = 'توان خرید در حال حاضر دریافت نشد.';
  else if (!loading && (unavailable || !available)) message = 'توان خرید برای این حساب در دسترس نیست.';

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-800">توان خرید</h2>

      {loading ? (
        <div className="mt-3 h-9 w-40 animate-pulse rounded-lg bg-slate-100" />
      ) : message ? (
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
      ) : (
        <>
          <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">
            {formatWholeMoney(available)}
          </p>
          <p className="mt-auto border-t border-slate-100 pt-3 text-xs text-slate-500">
            {hasLivePrice && grams
              ? `~ معادل ${formatWeight(grams)} طلا`
              : hasLivePrice
                ? 'توان خرید فعلی برای حداقل ۰٫۰۰۱ گرم کافی نیست.'
                : 'قیمت لحظه‌ای طلا در دسترس نیست.'}
          </p>
        </>
      )}
    </section>
  );
}
