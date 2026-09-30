'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { reportsApi, type ReportQuery } from '@/lib/internal-api';
import { PageHeader } from './page-header';
import { FilterBar } from './filter-bar';
import { ForbiddenNotice } from './permission-gate';
import { ApiErrorState } from './states';
import { formatMoney, formatWeight } from '@/lib/utils';

export type ReportKind =
  | 'customers'
  | 'orders'
  | 'trades'
  | 'payments'
  | 'settlements'
  | 'financial'
  | 'gold'
  | 'suppliers'
  | 'pricing';

const META: Record<ReportKind, { title: string; permission: string | string[] }> = {
  customers: { title: 'گزارش مشتریان', permission: 'reports' },
  orders: { title: 'گزارش سفارش‌ها', permission: 'reports' },
  trades: { title: 'گزارش معاملات', permission: 'reports' },
  payments: { title: 'گزارش پرداخت‌ها', permission: 'financial_report.read' },
  settlements: { title: 'گزارش تسویه', permission: 'financial_report.read' },
  financial: { title: 'گزارش دفتر مالی', permission: 'financial_report.read' },
  gold: { title: 'گزارش طلا', permission: 'financial_report.read' },
  suppliers: { title: 'گزارش تأمین‌کنندگان', permission: 'reports' },
  pricing: { title: 'گزارش قیمت', permission: 'reports' },
};

export function ReportView({ kind }: { kind: ReportKind }) {
  const { user } = useAuth();
  const meta = META[kind];
  const allowed = hasPermission(user?.permissions, meta.permission);
  const [draft, setDraft] = useState({ from: '', to: '', status: '' });
  const [applied, setApplied] = useState(draft);
  const [page, setPage] = useState(1);
  const query: ReportQuery = {
    from: applied.from || undefined,
    to: applied.to || undefined,
    status: applied.status || undefined,
    limit: 20,
    offset: (page - 1) * 20,
  };
  const report = useSWR(allowed ? ['report', kind, applied, page] : null, () => loadReport(kind, query));

  if (!allowed) {
    return <ForbiddenNotice permission={Array.isArray(meta.permission) ? meta.permission[0] : meta.permission} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader title={meta.title} description="اعداد و ردیف‌ها از سرویس گزارش خوانده می‌شوند و در صفحه محاسبه نمی‌شوند." />
      <FilterBar
        fields={[
          { key: 'from', label: 'از تاریخ', type: 'date' },
          { key: 'to', label: 'تا تاریخ', type: 'date' },
          { key: 'status', label: 'وضعیت', dir: 'ltr', placeholder: 'مقدار وضعیت سرور' },
        ]}
        values={draft}
        onChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
        onSubmit={() => {
          setApplied(draft);
          setPage(1);
        }}
        onReset={() => {
          const empty = { from: '', to: '', status: '' };
          setDraft(empty);
          setApplied(empty);
          setPage(1);
        }}
      />
      {report.error ? <ApiErrorState error={report.error} onRetry={() => void report.mutate()} /> : null}
      {report.isLoading ? <p className="text-sm text-muted-foreground">در حال دریافت گزارش…</p> : null}
      {report.data ? <ReportBody kind={kind} data={report.data} /> : null}
      <div className="flex gap-2">
        <button className="rounded-md border px-3 py-1 text-sm" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
          قبلی
        </button>
        <button className="rounded-md border px-3 py-1 text-sm" type="button" onClick={() => setPage((current) => current + 1)}>
          بعدی
        </button>
      </div>
    </div>
  );
}

async function loadReport(kind: ReportKind, query: ReportQuery) {
  switch (kind) {
    case 'customers':
      return reportsApi.customers(query);
    case 'orders':
      return reportsApi.orders(query);
    case 'trades':
      return reportsApi.trades(query);
    case 'payments':
      return reportsApi.payments(query);
    case 'settlements':
      return reportsApi.settlements(query);
    case 'financial':
      return reportsApi.financial(query);
    case 'gold':
      return reportsApi.gold(query);
    case 'suppliers':
      return reportsApi.suppliers(query);
    case 'pricing':
      return reportsApi.pricing(query);
  }
}

function ReportBody({ kind, data }: { kind: ReportKind; data: Awaited<ReturnType<typeof loadReport>> }) {
  if (kind === 'customers') {
    const report = data as import('@/lib/internal-api').CustomerReport;
    return (
      <SimpleTable
        headers={['شماره', 'نام', 'وضعیت', 'احراز', 'سقف اعتبار', 'در دسترس']}
        rows={report.customers.map((row) => [
          row.customerNumber,
          `${row.firstName} ${row.lastName}`,
          row.status,
          row.kycStatus ?? '—',
          formatMoney(row.creditLimitRial),
          formatMoney(row.availableCreditRial),
        ])}
      />
    );
  }
  if (kind === 'orders') {
    const report = data as import('@/lib/internal-api').OrderReport;
    return (
      <SimpleTable
        headers={['شماره', 'وضعیت', 'مبلغ', 'وزن']}
        rows={report.orders.map((row) => [
          row.orderNumber,
          row.status,
          formatMoney(row.totalAmountRial),
          formatWeight(row.weightGrams),
        ])}
      />
    );
  }
  if (kind === 'trades') {
    const report = data as import('@/lib/internal-api').TradeReport;
    return (
      <div className="space-y-3">
        <p className="text-sm">جمع مبلغ {formatMoney(report.totalValueRial)} — جمع وزن {formatWeight(report.totalWeightGrams)}</p>
        <SimpleTable
          headers={['شماره', 'وضعیت', 'مبلغ', 'وزن']}
          rows={report.trades.map((row) => [row.tradeNumber, row.status, formatMoney(row.totalAmountRial), formatWeight(row.weightGrams)])}
        />
      </div>
    );
  }
  if (kind === 'payments') {
    const report = data as import('@/lib/internal-api').PaymentReport;
    return (
      <div className="space-y-3">
        <p className="text-sm">جمع {formatMoney(report.totalValueRial)}</p>
        <SimpleTable
          headers={['روش', 'وضعیت', 'مبلغ', 'ارجاع']}
          rows={report.payments.map((row) => [row.method, row.status, formatMoney(row.amount), row.referenceNumber ?? '—'])}
        />
      </div>
    );
  }
  if (kind === 'settlements') {
    const report = data as import('@/lib/internal-api').SettlementReport;
    return (
      <div className="space-y-3">
        <p className="text-sm">تسویه‌شده {formatMoney(report.totalSettledValueRial)} — باز {formatMoney(report.totalPendingValueRial)}</p>
        <SimpleTable
          headers={['معامله', 'وضعیت', 'مبلغ']}
          rows={report.settlements.map((row) => [row.tradeId, row.status, formatMoney(row.settledAmount)])}
        />
      </div>
    );
  }
  if (kind === 'financial') {
    const report = data as import('@/lib/internal-api').FinancialReport;
    return (
      <div className="space-y-4">
        <SimpleTable
          headers={['کد', 'نام', 'بدهکار', 'بستانکار', 'خالص']}
          rows={report.accountBalances.map((row) => [
            row.accountCode,
            row.accountName,
            formatMoney(row.totalDebit),
            formatMoney(row.totalCredit),
            formatMoney(row.netBalance),
          ])}
        />
        <SimpleTable
          headers={['حساب', 'بدهکار', 'بستانکار', 'منبع', 'تاریخ']}
          rows={report.entries.map((row) => [row.accountCode, formatMoney(row.debit), formatMoney(row.credit), row.sourceType, row.createdAt])}
        />
      </div>
    );
  }
  if (kind === 'gold') {
    const report = data as import('@/lib/internal-api').GoldReport;
    return (
      <div className="space-y-4">
        <SimpleTable
          headers={['کد', 'نام', 'خالص', 'ورود', 'خروج']}
          rows={report.accountBalances.map((row) => [
            row.accountCode,
            row.accountName,
            formatWeight(row.netQuantityGrams),
            formatWeight(row.totalInGrams),
            formatWeight(row.totalOutGrams),
          ])}
        />
        <SimpleTable
          headers={['حساب', 'جهت', 'وزن', 'منبع']}
          rows={report.entries.map((row) => [row.accountCode, row.direction, formatWeight(row.quantity), row.sourceType])}
        />
      </div>
    );
  }
  if (kind === 'suppliers') {
    const report = data as import('@/lib/internal-api').SupplierReport;
    return (
      <SimpleTable
        headers={['شماره', 'نام', 'خرید', 'مانده']}
        rows={report.suppliers.map((row) => [
          row.supplierNumber,
          row.name,
          formatMoney(row.totalPurchasedRial),
          formatMoney(row.outstandingRial),
        ])}
      />
    );
  }
  const pricing = data as import('@/lib/internal-api').PricingReport;
  return (
    <div className="space-y-4">
      <SimpleTable
        headers={['زمان', 'مقدار نرمال', 'وضعیت']}
        rows={pricing.snapshots.map((row) => [row.capturedAt, row.normalizedValue, row.status])}
      />
      <SimpleTable
        headers={['منبع', 'قیمت پایه', 'قیمت نهایی']}
        rows={pricing.calculations.map((row) => [row.sourceType, row.basePrice, row.finalPrice])}
      />
    </div>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">ردیفی برای این فیلتر نیست.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-muted/50 text-muted-foreground">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 text-right">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
