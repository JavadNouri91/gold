'use client';

import type { CreditLedgerEntry, CustomerAccount } from '@/lib/api';
import type { CreditOrderRow } from '@/lib/credit-view';
import { isCreditInactive, selectCreditFigures } from '@/lib/credit-view';
import type { CreditTrendPeriod, CreditTrendSeries } from '@/lib/credit-trend-preview';
import { CreditComposition } from './credit-composition';
import { CreditDetails } from './credit-details';
import { CreditHistory } from './credit-history';
import { CreditIncreaseRequest } from './credit-increase-request';
import { CreditLimitCard } from './credit-limit-card';
import { CreditOrders } from './credit-orders';
import { CreditRulesInfo } from './credit-rules-info';
import { CreditSummaryCards } from './credit-summary-cards';
import { CreditTrendChart } from './credit-trend-chart';
import { CreditRetry, CreditSkeleton, creditCardClass } from './credit-ui';

export function CreditPage({
  account,
  accountLoading,
  accountMissing,
  accountError,
  onRetryAccount,
  entries,
  historyLoading,
  historyError,
  onRetryHistory,
  orders,
  ordersLoading,
  ordersError,
  onRetryOrders,
  trend,
  period,
  onPeriodChange,
}: {
  account?: CustomerAccount;
  accountLoading?: boolean;
  accountMissing?: boolean;
  accountError?: boolean;
  onRetryAccount?: () => void;
  entries: CreditLedgerEntry[];
  historyLoading?: boolean;
  historyError?: boolean;
  onRetryHistory?: () => void;
  orders: CreditOrderRow[];
  ordersLoading?: boolean;
  ordersError?: boolean;
  onRetryOrders?: () => void;
  trend: CreditTrendSeries;
  period: CreditTrendPeriod;
  onPeriodChange: (period: CreditTrendPeriod) => void;
}) {
  const figures = account ? selectCreditFigures(account) : null;
  const inactive = Boolean(accountMissing) || (figures != null && isCreditInactive(figures));

  if (accountLoading) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-4 overflow-x-hidden" aria-busy="true">
        <CreditSkeleton className="h-40 w-full" />
        <div className="grid grid-cols-3 gap-2">
          <CreditSkeleton className="h-28" />
          <CreditSkeleton className="h-28" />
          <CreditSkeleton className="h-28" />
        </div>
        <CreditSkeleton className="h-52 w-full" />
        <CreditSkeleton className="h-52 w-full" />
        <CreditSkeleton className="h-40 w-full" />
        <CreditSkeleton className="h-40 w-full" />
      </div>
    );
  }

  if (accountError || (account && !figures)) {
    return (
      <CreditRetry
        message="اطلاعات اعتبار در حال حاضر قابل دریافت نیست."
        onRetry={onRetryAccount}
      />
    );
  }

  if (inactive || !figures) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-4 overflow-x-hidden">
        <section className={creditCardClass}>
          <p className="text-sm leading-7 text-[#202124]">اعتبار معاملاتی برای حساب شما فعال نشده است.</p>
        </section>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CreditIncreaseRequest />
          <CreditRulesInfo />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-4 overflow-x-hidden">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4 lg:gap-4">
        <CreditLimitCard figures={figures} />
        <div className="grid grid-cols-3 gap-2 lg:contents">
          <CreditSummaryCards figures={figures} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <CreditComposition figures={figures} />
        <CreditTrendChart series={trend} period={period} onPeriodChange={onPeriodChange} />
        <CreditDetails figures={figures} className="md:col-span-2 lg:col-span-1" />
      </div>

      <CreditOrders
        orders={orders}
        loading={ordersLoading}
        error={ordersError}
        onRetry={onRetryOrders}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <CreditHistory
          className="lg:col-span-3"
          entries={entries}
          orders={orders}
          loading={historyLoading}
          error={historyError}
          onRetry={onRetryHistory}
        />
        <div className="flex flex-col gap-4 lg:col-span-2">
          <CreditIncreaseRequest />
          <CreditRulesInfo />
        </div>
      </div>
    </div>
  );
}
