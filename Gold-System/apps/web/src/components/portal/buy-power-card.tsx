'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Scale } from 'lucide-react';
import { ApiClientError, customerApi, type CurrentPrice } from '@/lib/api';
import { buyableGoldGrams } from '@/lib/buyable-gold';
import { readAvailableCredit } from '@/lib/credit-view';
import { formatRial, formatWeight } from '@/lib/utils';

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

  let body: { grams: string; hint: string } | { message: string };
  if (loading) {
    body = { message: '' };
  } else if (failed) {
    body = { message: 'توان خرید در حال حاضر دریافت نشد.' };
  } else if (unavailable || !available) {
    body = { message: 'توان خرید برای این حساب در دسترس نیست.' };
  } else if (!hasLivePrice) {
    body = { message: 'قیمت لحظه‌ای طلا در دسترس نیست.' };
  } else if (!grams) {
    body = { message: 'توان خرید فعلی برای حداقل ۰٫۰۰۱ گرم کافی نیست.' };
  } else {
    body = {
      grams,
      hint: `با ${formatRial(available)} توان خرید و قیمت ${formatRial(livePrice)} هر گرم`,
    };
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">توان خرید طلا</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">برآورد لحظه‌ای از توان خرید و قیمت هر گرم</p>
        </div>
        <Scale className="h-5 w-5 shrink-0 text-gold-700" aria-hidden />
      </div>

      {loading ? (
        <div className="mt-4 h-10 w-36 animate-pulse rounded-lg bg-slate-100" />
      ) : 'grams' in body ? (
        <>
          <p className="mt-4 text-3xl font-bold tabular-nums text-slate-900">{formatWeight(body.grams)}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{body.hint}</p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            کارمزد سفارش در این عدد نیست و هنگام ثبت خرید محاسبه می‌شود.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm leading-7 text-slate-700">{body.message}</p>
      )}

      <Link
        href="/portal/orders/new?side=buy"
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        خرید طلا
      </Link>
    </section>
  );
}
