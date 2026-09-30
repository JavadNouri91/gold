/**
 * Isolated visual/demo data for customer-dashboard surfaces that have no
 * customer-facing API yet (gold holdings, unrealized P&L, price history).
 *
 * Do not use these values for credit, KYC, orders, trades, or live price
 * when those endpoints succeed. Do not treat this as a pricing engine.
 */

export type ChartPeriod = '1d' | '1w' | '1m' | '3m';

export const CHART_PERIOD_LABELS: Record<ChartPeriod, string> = {
  '1d': '۱ روز',
  '1w': '۱ هفته',
  '1m': '۱ ماه',
  '3m': '۳ ماه',
};

/** Visual-only series around a reference price. Not historical market data. */
export function demoPriceSeries(basePrice: number, period: ChartPeriod): number[] {
  const count = period === '1d' ? 24 : period === '1w' ? 28 : period === '1m' ? 30 : 36;
  const amplitude = Math.max(basePrice * 0.006, 1);
  return Array.from({ length: count }, (_, i) => {
    const wave = Math.sin(i / 3.2) * amplitude + Math.cos(i / 7.1) * amplitude * 0.35;
    return Math.max(0, basePrice + wave);
  });
}

export const DEMO_REFERENCE_PRICE_RIAL = 58_420_000;

/**
 * Placeholder holdings until a customer gold-balance API exists.
 * Shown with an explicit «نمونه نمایشی» marker in the UI.
 */
export const DEMO_PORTFOLIO = {
  weightGrams: '24.750',
  marketValueRial: '5875000000',
  avgBuyPriceRial: '56125000',
  unrealizedPnlRial: '236000000',
  unrealizedPnlPercent: '4.7',
};

export type DemoSide = 'BUY' | 'SELL';

export interface DemoOrderRow {
  id: string;
  orderNumber: string;
  side: DemoSide;
  weightGrams: string;
  unitPriceRial: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  demo: true;
}

export interface DemoTradeRow {
  id: string;
  tradeNumber: string;
  side: DemoSide;
  weightGrams: string;
  unitPriceRial: string;
  totalAmountRial: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  demo: true;
}

/** Visual sample rows for the dashboard tables. Not live order/trade records. */
export const DEMO_ACTIVE_ORDERS: DemoOrderRow[] = [
  {
    id: 'demo-ord-1',
    orderNumber: 'ORD-1405-0034',
    side: 'BUY',
    weightGrams: '10',
    unitPriceRial: '58730000',
    status: 'SUBMITTED',
    statusLabel: 'در انتظار ثبت',
    createdAt: '2026-09-29T08:10:00.000Z',
    demo: true,
  },
  {
    id: 'demo-ord-2',
    orderNumber: 'ORD-1405-0033',
    side: 'SELL',
    weightGrams: '5',
    unitPriceRial: '58800000',
    status: 'ACTIVE',
    statusLabel: 'فعال',
    createdAt: '2026-09-28T11:40:00.000Z',
    demo: true,
  },
  {
    id: 'demo-ord-3',
    orderNumber: 'ORD-1405-0032',
    side: 'BUY',
    weightGrams: '20',
    unitPriceRial: '58600000',
    status: 'COMPLETED',
    statusLabel: 'تکمیل شده',
    createdAt: '2026-09-27T09:20:00.000Z',
    demo: true,
  },
  {
    id: 'demo-ord-4',
    orderNumber: 'ORD-1405-0031',
    side: 'SELL',
    weightGrams: '10',
    unitPriceRial: '58650000',
    status: 'CANCELLED',
    statusLabel: 'لغو شده',
    createdAt: '2026-09-19T07:00:00.000Z',
    demo: true,
  },
  {
    id: 'demo-ord-5',
    orderNumber: 'ORD-1405-0030',
    side: 'BUY',
    weightGrams: '5',
    unitPriceRial: '57700000',
    status: 'COMPLETED',
    statusLabel: 'تکمیل شده',
    createdAt: '2026-09-17T14:15:00.000Z',
    demo: true,
  },
];

export const DEMO_RECENT_TRADES: DemoTradeRow[] = [
  {
    id: 'demo-trx-1',
    tradeNumber: 'TRX-1405-00125',
    side: 'BUY',
    weightGrams: '10',
    unitPriceRial: '58400000',
    totalAmountRial: '584000000',
    status: 'COMPLETED',
    statusLabel: 'تکمیل شده',
    createdAt: '2026-09-29T07:30:00.000Z',
    demo: true,
  },
  {
    id: 'demo-trx-2',
    tradeNumber: 'TRX-1405-00124',
    side: 'SELL',
    weightGrams: '5',
    unitPriceRial: '58700000',
    totalAmountRial: '293500000',
    status: 'COMPLETED',
    statusLabel: 'تکمیل شده',
    createdAt: '2026-09-28T16:20:00.000Z',
    demo: true,
  },
  {
    id: 'demo-trx-3',
    tradeNumber: 'TRX-1405-00123',
    side: 'BUY',
    weightGrams: '20',
    unitPriceRial: '58100000',
    totalAmountRial: '1162000000',
    status: 'SETTLED',
    statusLabel: 'تسویه شده',
    createdAt: '2026-09-27T12:05:00.000Z',
    demo: true,
  },
  {
    id: 'demo-trx-4',
    tradeNumber: 'TRX-1405-00122',
    side: 'SELL',
    weightGrams: '8',
    unitPriceRial: '58500000',
    totalAmountRial: '468000000',
    status: 'SETTLING',
    statusLabel: 'در حال تسویه',
    createdAt: '2026-09-19T10:45:00.000Z',
    demo: true,
  },
  {
    id: 'demo-trx-5',
    tradeNumber: 'TRX-1405-00121',
    side: 'BUY',
    weightGrams: '15',
    unitPriceRial: '57900000',
    totalAmountRial: '868500000',
    status: 'COMPLETED',
    statusLabel: 'تکمیل شده',
    createdAt: '2026-09-17T08:00:00.000Z',
    demo: true,
  },
];
