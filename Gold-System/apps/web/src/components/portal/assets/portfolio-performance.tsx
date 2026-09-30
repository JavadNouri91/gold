import { useMemo } from 'react';
import { formatRial } from '@/lib/utils';
import type { PortfolioHistorySeries, PortfolioPeriod } from '@/lib/portfolio-history-preview';
import { summarizePreviewRial } from '@/lib/portfolio-history-preview';
import { MetricTile, PeriodPills, PreviewNote, assetCardClass } from './assets-ui';

export function PortfolioPerformance({
  series,
  period,
  onPeriodChange,
}: {
  series: PortfolioHistorySeries;
  period: PortfolioPeriod;
  onPeriodChange: (period: PortfolioPeriod) => void;
}) {
  const summary = useMemo(() => summarizePreviewRial(series.points), [series.points]);

  return (
    <section aria-labelledby="performance-title" id="portfolio-performance" className={assetCardClass}>
      <h2 id="performance-title" className="text-base font-bold text-[#202124]">
        عملکرد دارایی
      </h2>
      <div className="mt-3">
        <PreviewNote />
      </div>
      <div className="mt-3">
        <PeriodPills
          period={period}
          onChange={onPeriodChange}
          labelKind="performanceLabel"
          label="بازه عملکرد دارایی"
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-3">
        <MetricTile label="بالاترین ارزش">
          <p className="tabular-nums">{summary ? formatRial(summary.max) : '—'}</p>
        </MetricTile>
        <MetricTile label="پایین‌ترین ارزش">
          <p className="tabular-nums">{summary ? formatRial(summary.min) : '—'}</p>
        </MetricTile>
        <MetricTile label="میانگین ارزش">
          <p className="tabular-nums">{summary ? formatRial(summary.avg) : '—'}</p>
        </MetricTile>
      </div>
    </section>
  );
}
