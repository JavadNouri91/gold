import { formatRial } from '@/lib/utils';
import type { PortfolioPosition } from '@/lib/customer-portfolio';
import { isRegisteredHolding } from '@/lib/customer-portfolio';
import { MetricTile, SignedMoney, assetCardClass } from './assets-ui';

export function PortfolioMetrics({ position }: { position: PortfolioPosition | null }) {
  const holding = isRegisteredHolding(position) ? position : null;

  return (
    <section aria-labelledby="portfolio-metrics-title" className={assetCardClass}>
      <h2 id="portfolio-metrics-title" className="text-base font-bold text-[#202124]">
        شاخص‌های دارایی
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
        <MetricTile label="میانگین قیمت خرید">
          <p className="tabular-nums">{holding ? formatRial(holding.averageBuyPriceRial) : '—'}</p>
        </MetricTile>
        <MetricTile label="سود/زیان تحقق‌یافته">
          <SignedMoney value={holding?.realizedPnlRial} />
        </MetricTile>
        <MetricTile label="سود/زیان تحقق‌نیافته">
          <SignedMoney value={holding?.unrealizedPnlRial} />
        </MetricTile>
        {holding?.totalBuyValueRial ? (
          <MetricTile label="ارزش خرید کل">
            <p className="tabular-nums">{formatRial(holding.totalBuyValueRial)}</p>
          </MetricTile>
        ) : null}
        {holding?.totalSellValueRial ? (
          <MetricTile label="ارزش فروش کل">
            <p className="tabular-nums">{formatRial(holding.totalSellValueRial)}</p>
          </MetricTile>
        ) : null}
      </div>
    </section>
  );
}
