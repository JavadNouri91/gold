'use client';

import useSWR from 'swr';
import { pricingApi } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

export function AssetsHeader() {
  const price = useSWR('pricing/current-price', () => pricingApi.getCurrentPrice());
  const live = price.data;
  const marketOpen = live?.validityStatus === 'VALID';

  return (
    <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-base font-bold text-[#202124] md:text-lg">دارایی‌های من</h1>
        <p className="mt-0.5 text-xs leading-5 text-[#6B7280] md:text-sm">
          نمای کلی از موجودی طلا، نقدینگی و دارایی‌های شما
        </p>
      </div>
      {live ? (
        <div className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#ECFDF3] px-3 text-xs text-[#166534]">
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full rounded-full ${marketOpen ? 'animate-ping bg-[#22C55E] opacity-60' : 'bg-amber-400'}`}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${marketOpen ? 'bg-[#16A34A]' : 'bg-amber-500'}`}
            />
          </span>
          <span className="font-semibold">{marketOpen ? 'بازار فعال است' : 'قیمت نامعتبر'}</span>
          <span className="hidden text-[#6B7280] sm:inline">آخرین بروزرسانی: {formatDateTime(live.capturedAt)}</span>
        </div>
      ) : null}
    </div>
  );
}
