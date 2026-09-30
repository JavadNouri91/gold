import React from 'react';
import { render, screen } from '@testing-library/react';
import { UserStatusBadge } from '../components/portal/user-status-badge';
import { KycStatusCard, resolveKycUiStatus } from '../components/portal/kyc-status-card';
import { QuickActions } from '../components/portal/quick-actions';
import { ActiveOrders } from '../components/portal/active-orders';
import { RecentTransactions } from '../components/portal/recent-transactions';
import { PortfolioCard } from '../components/portal/portfolio-card';
import { TradingCreditCard } from '../components/portal/trading-credit-card';
import { GoldPriceChart } from '../components/portal/gold-price-chart';
import { demoPriceSeries, DEMO_ACTIVE_ORDERS, DEMO_RECENT_TRADES } from '../lib/portal-demo';
import type { CustomerAccount } from '../lib/api';

describe('resolveKycUiStatus', () => {
  it('maps approved and active customers to approved', () => {
    expect(resolveKycUiStatus({ customerStatus: 'ACTIVE' })).toBe('approved');
    expect(resolveKycUiStatus({ kycStatus: 'APPROVED' })).toBe('approved');
  });

  it('maps rejected KYC to revision', () => {
    expect(resolveKycUiStatus({ kycStatus: 'REJECTED' })).toBe('revision');
  });

  it('maps pending review to review', () => {
    expect(resolveKycUiStatus({ kycStatus: 'UNDER_REVIEW' })).toBe('review');
  });

  it('maps missing KYC to unverified', () => {
    expect(resolveKycUiStatus({})).toBe('unverified');
  });
});

describe('UserStatusBadge', () => {
  it('shows household customer type', () => {
    render(<UserStatusBadge type="HOUSEHOLD" status="ACTIVE" />);
    expect(screen.getByText('مشتری خانگی')).toBeInTheDocument();
    expect(screen.getByText('فعال')).toBeInTheDocument();
  });

  it('shows partner and VIP labels', () => {
    const { rerender } = render(<UserStatusBadge type="PARTNER" status="ACTIVE" />);
    expect(screen.getByText('همکار')).toBeInTheDocument();
    rerender(<UserStatusBadge type="VIP" status="ACTIVE" />);
    expect(screen.getByText('VIP')).toBeInTheDocument();
  });
});

describe('KycStatusCard', () => {
  it('renders verified copy', () => {
    render(<KycStatusCard customerStatus="ACTIVE" kycStatus="APPROVED" />);
    expect(screen.getByText('احراز هویت شما تأیید شده است.')).toBeInTheDocument();
  });
});

describe('QuickActions', () => {
  it('links to existing portal routes', () => {
    render(<QuickActions />);
    expect(screen.getByText('تاریخچه پرداخت').closest('a')).toHaveAttribute('href', '/portal/payments');
    expect(screen.getByText('سفارش جدید').closest('a')).toHaveAttribute(
      'href',
      '/portal/orders/new',
    );
  });
});

describe('PortfolioCard', () => {
  it('marks holdings as demo data', () => {
    render(<PortfolioCard />);
    expect(screen.getByText(/نمونه نمایشی/)).toBeInTheDocument();
    expect(screen.getByText('خرید طلا')).toBeInTheDocument();
    expect(screen.getByText('فروش طلا')).toBeInTheDocument();
  });
});

describe('TradingCreditCard', () => {
  const account: CustomerAccount = {
    id: 'acc-1',
    customerId: 'c-1',
    status: 'ACTIVE',
    creditLimitRial: '10000000000.00',
    reservedCreditRial: '1000000000.00',
    consumedCreditRial: '1750000000.00',
    availableCreditRial: '7250000000.00',
    creditLimitGoldRial: '0.00',
    reservedCreditGoldRial: '0.00',
    consumedCreditGoldRial: '0.00',
  };

  it('renders credit labels from the account API', () => {
    render(<TradingCreditCard account={account} />);
    expect(screen.getByText('اعتبار معاملاتی')).toBeInTheDocument();
    expect(screen.getByText('کل اعتبار')).toBeInTheDocument();
    expect(screen.getByText('درخواست افزایش اعتبار').closest('a')).toHaveAttribute(
      'href',
      '/portal/credit',
    );
  });
});

describe('ActiveOrders', () => {
  it('renders five sample orders', () => {
    render(<ActiveOrders orders={DEMO_ACTIVE_ORDERS} />);
    expect(screen.getAllByText('ORD-1405-0034').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ORD-1405-0030').length).toBeGreaterThan(0);
    expect(DEMO_ACTIVE_ORDERS).toHaveLength(5);
  });
});

describe('RecentTransactions', () => {
  it('renders five sample trades', () => {
    render(<RecentTransactions trades={DEMO_RECENT_TRADES} />);
    expect(screen.getAllByText('TRX-1405-00125').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TRX-1405-00121').length).toBeGreaterThan(0);
    expect(DEMO_RECENT_TRADES).toHaveLength(5);
  });
});

describe('GoldPriceChart', () => {
  it('renders an accessible chart', () => {
    render(<GoldPriceChart series={demoPriceSeries(58420000, '1d')} period="1d" />);
    expect(screen.getByLabelText('نمودار قیمت طلای آبشده')).toBeInTheDocument();
  });
});
