'use client';

import { cn } from '@/lib/utils';
import { creditBarShares, maxCreditBarUnits } from '@/lib/credit-view';
import {
  CREDIT_TREND_PERIODS,
  type CreditTrendPeriod,
  type CreditTrendSeries,
} from '@/lib/credit-trend-preview';
import { CreditSection } from './credit-ui';

export function CreditTrendChart({
  series,
  period,
  onPeriodChange,
}: {
  series: CreditTrendSeries;
  period: CreditTrendPeriod;
  onPeriodChange: (period: CreditTrendPeriod) => void;
}) {
  const max = maxCreditBarUnits(series.points);
  const summary =
    'نمودار نمونه روند اعتبار است و مانده واقعی حساب را نشان نمی‌دهد. بخش‌ها: مصرف‌شده، رزروشده و در دسترس.';
  const title =
    period === '7d'
      ? 'روند اعتبار در ۷ روز گذشته'
      : period === '3m'
        ? 'روند اعتبار در ۳ ماه گذشته'
        : 'روند اعتبار در ۳۰ روز گذشته';

  return (
    <CreditSection title={title} id="credit-trend-title">
      <p className="mt-3 rounded-xl bg-[#FFF4D6] px-3 py-2 text-[11px] leading-5 text-amber-900">
        نمونه نمایشی — روند روزانه اعتبار از سرور دریافت نمی‌شود و موجودی شما را نشان نمی‌دهد.
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="بازه روند اعتبار">
        {CREDIT_TREND_PERIODS.map((item) => {
          const active = item.id === period;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => onPeriodChange(item.id)}
              className={cn(
                'min-h-11 rounded-full px-3 text-xs font-medium',
                active ? 'bg-[#C8922E] text-white' : 'bg-[#F8F9FA] text-[#202124] hover:bg-[#FFF4D6]',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <p className="sr-only">{summary}</p>
      <div className="mt-4 overflow-hidden" aria-hidden>
        <div className="flex h-40 items-stretch gap-1">
          {series.points.map((point) => {
            const shares = creditBarShares(point, max);
            return (
                <div key={point.id} className="relative h-full min-w-0 flex-1">
                  <div className="absolute inset-x-0 bottom-0 rounded-sm bg-[#DC2626]" style={{ height: `${shares.consumed}%` }} />
                  <div
                    className="absolute inset-x-0 bg-[#F59E0B]"
                    style={{ bottom: `${shares.consumed}%`, height: `${shares.reserved}%` }}
                  />
                  <div
                    className="absolute inset-x-0 rounded-t-sm bg-[#16A34A]"
                    style={{
                      bottom: `${shares.consumed + shares.reserved}%`,
                      height: `${shares.available}%`,
                    }}
                  />
                </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-1">
          {series.points.map((point, index) => (
            <span
              key={point.id}
              className="min-w-0 flex-1 truncate text-center text-[9px] text-[#6B7280]"
            >
              {labelVisible(series.points.length, index) ? point.label : ''}
            </span>
          ))}
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-3 text-xs text-[#202124]">
        <Legend color="#16A34A" label="در دسترس" />
        <Legend color="#F59E0B" label="رزرو شده" />
        <Legend color="#DC2626" label="مصرف شده" />
      </ul>
    </CreditSection>
  );
}

function labelVisible(count: number, index: number): boolean {
  if (count <= 8) return true;
  return index % 3 === 0 || index === count - 1;
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {label}
    </li>
  );
}
