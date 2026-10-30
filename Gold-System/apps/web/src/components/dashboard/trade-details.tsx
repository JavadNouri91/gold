'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Calendar, Coins, Gem, Receipt, Scale, UserRound, Wallet } from 'lucide-react';
import { type StaffTrade } from '@/lib/internal-api';
import { TradeApprovalPanel } from '@/components/dashboard/trade-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MobileNumber } from '@/components/ui/mobile-input';
import { SideBadge } from '@/components/ui/side-badge';
import { StatusBadge } from '@/components/portal/status-badge';
import {
  TRADE_STATUS_LABELS,
  cn,
  formatDateTime,
  formatMoney,
  formatPurity,
  formatWeight,
  orderStatusPresentation,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';

/**
 * Body of the Trade detail view. Shared by the full detail page and the
 * list-page modal so both render exactly the same data.
 */
export function TradeDetails({
  trade,
  onChanged,
  showApproval = true,
}: {
  trade: StaffTrade;
  onChanged?: () => void;
  showApproval?: boolean;
}) {
  return (
    <div className="space-y-4">
      <Card className="print-doc-card">
        <CardContent className="print-doc-metrics grid grid-cols-1 gap-0 p-0 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCell
            label="مبلغ کل"
            value={formatMoney(trade.totalAmountRial)}
            icon={Wallet}
            tone="gold"
          />
          <MetricCell label="وزن" value={formatWeight(trade.weightGrams)} icon={Scale} tone="blue" />
          <MetricCell label="عیار" value={formatPurity(trade.purityRatio)} icon={Gem} tone="amber" />
          <MetricCell
            label="قیمت هر گرم"
            value={formatMoney(trade.unitPriceRial)}
            icon={Coins}
            tone="slate"
          />
          <MetricCell
            label="مبلغ کارمزد"
            value={formatMoney(trade.feeAmountRial)}
            icon={Receipt}
            tone="green"
          />
        </CardContent>
      </Card>

      <div className="print-doc-columns grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card className="print-doc-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
            <CardTitle className="text-base">اطلاعات مشتری</CardTitle>
            <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <dl className="divide-y divide-border text-sm">
              <DetailRow
                label="نام مشتری"
                value={
                  <Link
                    className="font-medium text-gold-800"
                    href={`/dashboard/customers/${trade.customerId}`}
                  >
                    {trade.customerName || 'مشاهده پرونده مشتری'}
                  </Link>
                }
              />
              {trade.customerNumber ? (
                <DetailRow
                  label="کد مشتری"
                  value={
                    <span dir="ltr" className="tabular-nums">
                      {toPersianDigits(trade.customerNumber)}
                    </span>
                  }
                />
              ) : null}
              {trade.customerMobile ? (
                <DetailRow label="موبایل" value={<MobileNumber value={trade.customerMobile} />} />
              ) : null}
              <DetailRow
                label="نوع معامله"
                value={<SideBadge side={trade.side} showIcon />}
              />
            </dl>
          </CardContent>
        </Card>

        <Card className="print-doc-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
            <CardTitle className="text-base">اطلاعات ثبت سفارش</CardTitle>
            <Link
              href={`/dashboard/orders/${trade.orderId}`}
              className="print-screen-only text-xs font-medium text-gold-800"
            >
              مشاهده سفارش
            </Link>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <dl className="divide-y divide-border text-sm">
              <DetailRow
                label="شماره سفارش"
                value={
                  <Link
                    href={`/dashboard/orders/${trade.orderId}`}
                    className="font-medium text-gold-800"
                    dir="ltr"
                  >
                    {trade.orderNumber ? toPersianDigits(trade.orderNumber) : '—'}
                  </Link>
                }
              />
              <DetailRow label="تاریخ ثبت سفارش" value={formatDateTime(trade.orderCreatedAt)} />
              <DetailRow
                label="وضعیت سفارش"
                value={
                  trade.orderStatus ? (
                    <StatusBadge {...orderStatusPresentation(trade.orderStatus)} />
                  ) : (
                    '—'
                  )
                }
              />
              <DetailRow label="کارمزد" value={formatMoney(trade.feeAmountRial)} />
              <DetailRow label="اجرت" value={formatMoney(trade.wageAmount)} />
              <DetailRow label="تخفیف" value={formatMoney(trade.discountAmount)} />
              <DetailRow label="جمع کل" value={formatMoney(trade.totalAmountRial)} emphasize />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="print-doc-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
          <CardTitle className="text-base">تأیید معامله</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden />
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
          <dl className="divide-y divide-border text-sm">
            <DetailRow
              label="وضعیت"
              value={
                <StatusBadge
                  status={trade.status}
                  label={statusLabel(TRADE_STATUS_LABELS, trade.status)}
                />
              }
            />
            <DetailRow
              label="تأییدکننده"
              value={
                trade.confirmedByName ? (
                  trade.confirmedByName
                ) : trade.confirmedByUserId ? (
                  <span dir="ltr" className="tabular-nums">
                    {toPersianDigits(trade.confirmedByUserId)}
                  </span>
                ) : (
                  '—'
                )
              }
            />
            <DetailRow label="تاریخ تأیید" value={formatDateTime(trade.confirmedAt)} />
            {trade.reversedAt ? (
              <>
                <DetailRow
                  label="برگشت‌دهنده"
                  value={
                    trade.reversedByName ? (
                      trade.reversedByName
                    ) : trade.reversedByUserId ? (
                      <span dir="ltr" className="tabular-nums">
                        {toPersianDigits(trade.reversedByUserId)}
                      </span>
                    ) : (
                      '—'
                    )
                  }
                />
                <DetailRow label="تاریخ برگشت" value={formatDateTime(trade.reversedAt)} />
                <DetailRow label="دلیل برگشت" value={trade.reversalReason ?? '—'} />
              </>
            ) : null}
          </dl>
          {showApproval ? (
            <div className="print-screen-only">
              <TradeApprovalPanel
                tradeId={trade.id}
                status={trade.status}
                onChanged={() => onChanged?.()}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

/** Receipt header rendered only on paper. */
export function TradePrintHeading({ trade }: { trade: StaffTrade }) {
  return (
    <div className="hidden border-b border-gray-300 pb-2 print:block">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">سامانه طلا — رسید معامله</p>
          <p className="mt-1 text-xs text-gray-600">
            شماره معامله:{' '}
            <span dir="ltr" className="tabular-nums">
              {toPersianDigits(trade.tradeNumber)}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            مشتری: {trade.customerName?.trim() || '—'}
          </p>
          {trade.customerNumber ? (
            <p className="mt-0.5 text-xs text-gray-600">
              کد مشتری:{' '}
              <span dir="ltr" className="tabular-nums">
                {toPersianDigits(trade.customerNumber)}
              </span>
            </p>
          ) : null}
        </div>
        <StatusBadge
          status={trade.status}
          label={statusLabel(TRADE_STATUS_LABELS, trade.status)}
        />
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 py-2.5',
        emphasize &&
          'print-doc-total -mx-4 mt-1 rounded-lg bg-gold-50 px-4 text-gold-900',
      )}
    >
      <dt className={cn('shrink-0 text-muted-foreground', emphasize && 'font-medium text-gold-800')}>
        {label}
      </dt>
      <dd className={cn('min-w-0 break-words text-left font-medium tabular-nums', emphasize && 'text-base')}>
        {value}
      </dd>
    </div>
  );
}

function MetricCell({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  tone: 'gold' | 'blue' | 'amber' | 'green' | 'slate';
}) {
  const tones = {
    gold: 'bg-gold-50 text-gold-700',
    blue: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-emerald-50 text-emerald-700',
    slate: 'bg-slate-50 text-slate-600',
  };
  return (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0 sm:border-b lg:border-b-0 lg:border-s lg:first:border-s-0">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold tabular-nums md:text-base">{value}</p>
      </div>
      <span
        className={cn(
          'print-doc-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          tones[tone],
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
    </div>
  );
}
