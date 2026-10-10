'use client';

import { LineChart } from 'lucide-react';
import { ASSET_CHART_RANGES, type AssetChartRange } from '@/lib/asset-chart-range';
import { cn } from '@/lib/utils';
import { CardHeading, EmptyNote, assetCardClass } from './assets-ui';

export function PortfolioValueChart({
  range,
  onRangeChange,
}: {
  range: AssetChartRange;
  onRangeChange: (range: AssetChartRange) => void;
}) {
  const label = ASSET_CHART_RANGES.find((item) => item.id === range)?.label ?? '';

  return (
    <section aria-labelledby="portfolio-chart-title" className={assetCardClass}>
      <CardHeading id="portfolio-chart-title" title="نمودار ارزش دارایی" icon={LineChart} />
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="بازه نمودار ارزش دارایی">
        {ASSET_CHART_RANGES.map((item) => {
          const active = item.id === range;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => onRangeChange(item.id)}
              className={cn(
                'min-h-11 rounded-full px-3 text-xs font-semibold',
                active ? 'bg-[#C8922E] text-white' : 'bg-[#F8F9FA] text-[#202124] hover:bg-[#FFF4D6]',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex min-h-48 items-center justify-center rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8F9FA] px-4 py-8 text-center">
        <EmptyNote>
          در بازه {label} تاریخچه ارزش دارایی ثبت نشده است. قیمت‌های گذشته برای ارزش‌گذاری موجودی در دسترس نیست.
        </EmptyNote>
      </div>
    </section>
  );
}
