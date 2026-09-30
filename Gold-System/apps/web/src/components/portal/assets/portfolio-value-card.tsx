import { formatRial } from '@/lib/utils';
import { isRegisteredHolding, type PortfolioPosition } from '@/lib/customer-portfolio';
import { SignedMoney, assetCardClass } from './assets-ui';

export function PortfolioValueCard({ position }: { position: PortfolioPosition | null }) {
  const holding = isRegisteredHolding(position) ? position : null;

  return (
    <section aria-labelledby="portfolio-value-title" className={assetCardClass}>
      <h2 id="portfolio-value-title" className="text-base font-bold text-[#202124]">
        ارزش روز دارایی
      </h2>
      {holding ? (
        <>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-[#202124] sm:text-3xl">
            {formatRial(holding.marketValueRial)}
          </p>
          <SignedMoney
            value={holding.changeRial}
            percent={holding.changePercent}
            className="mt-2 text-base"
          />
        </>
      ) : (
        <p className="mt-3 text-sm leading-7 text-[#6B7280]">
          ارزش روز پس از ثبت موجودی طلای آبشده نمایش داده می‌شود.
        </p>
      )}
    </section>
  );
}
