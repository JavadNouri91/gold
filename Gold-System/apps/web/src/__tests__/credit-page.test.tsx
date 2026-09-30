import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CustomerAccount, Order } from '@/lib/api';
import {
  creditOrderKind,
  creditOrders,
  presentCreditHistory,
  selectCreditFigures,
} from '@/lib/credit-view';
import { previewCreditTrend } from '@/lib/credit-trend-preview';
import { CreditPage } from '@/components/portal/credit/credit-page';

const account: CustomerAccount = {
  id: 'acc-1',
  customerId: 'c-1',
  status: 'ACTIVE',
  creditLimitRial: '5000000000.00',
  reservedCreditRial: '1500000000.00',
  consumedCreditRial: '1750000000.00',
  availableCreditRial: '0.00',
  availableRial: '1750000000.00',
  creditLimitGoldRial: '0.00',
  reservedCreditGoldRial: '0.00',
  consumedCreditGoldRial: '0.00',
  updatedAt: '2026-09-30T08:00:00.000Z',
};

const reservedOrder: Order = {
  id: 'order-1',
  orderNumber: 'ORD-000125',
  customerId: 'c-1',
  status: 'SUBMITTED',
  totalAmountRial: '2925000000.00',
  weightGrams: '50.000000',
  purityRatio: '0.995000',
  reservedAmountRial: '2925000000.00',
  createdAt: '2026-09-30T08:00:00.000Z',
};

describe('selectCreditFigures', () => {
  it('uses the server available balance and limit shares', () => {
    const figures = selectCreditFigures(account);
    expect(figures?.available).toBe('1750000000.00');
    expect(figures?.availablePercent).toBe(35);
    expect(figures?.reservedPercent).toBe(30);
    expect(figures?.consumedPercent).toBe(35);
    expect(figures?.usedPercent).toBe(65);
    expect(figures?.status.label).toBe('مجاز');
  });

  it('does not treat a zero limit as an active facility', () => {
    const figures = selectCreditFigures({
      ...account,
      creditLimitRial: '0.00',
      reservedCreditRial: '0.00',
      consumedCreditRial: '0.00',
      availableRial: '0.00',
    });
    expect(figures?.usedPercent).toBeNull();
  });
});

describe('credit orders and history', () => {
  it('keeps only orders that engage credit', () => {
    const draft: Order = { ...reservedOrder, id: 'draft', status: 'DRAFT', reservedAmountRial: '0.00' };
    expect(creditOrderKind(reservedOrder)).toBe('reserved');
    expect(creditOrderKind({ ...reservedOrder, status: 'REJECTED' })).toBe('released');
    expect(creditOrderKind({ ...reservedOrder, status: 'COMPLETED' })).toBe('consumed');
    expect(creditOrders([draft, reservedOrder])).toEqual([reservedOrder]);
  });

  it('describes a reservation without the raw server reason', () => {
    const view = presentCreditHistory(
      {
        id: 'tx-1',
        type: 'RESERVATION',
        creditPool: 'RIAL',
        amount: '1500000000.00',
        balanceAfter: '1750000000.00',
        sourceType: 'ORDER',
        sourceId: 'order-1',
        reason: 'Credit reserved for order submission',
        createdAt: '2026-09-30T08:00:00.000Z',
      },
      'ORD-000125',
    );
    expect(view.title).toBe('رزرو اعتبار');
    expect(view.description).toContain('ORD-000125');
    expect(view.description).not.toContain('Credit reserved');
    expect(view.balanceCaption).toBe('موجودی اعتبار');
  });
});

describe('CreditPage', () => {
  const trend = previewCreditTrend('30d');

  it('renders live balances, shares, and the preview disclosure', () => {
    render(
      <CreditPage
        account={account}
        entries={[]}
        orders={[{ ...reservedOrder, side: 'BUY' }]}
        trend={trend}
        period="30d"
        onPeriodChange={() => undefined}
      />,
    );
    expect(screen.getByText('سقف اعتبار شما')).toBeInTheDocument();
    expect(screen.getAllByText('۵,۰۰۰,۰۰۰,۰۰۰').length).toBeGreaterThan(0);
    expect(screen.getAllByText('۳۵٪').length).toBeGreaterThan(0);
    expect(screen.getAllByText('۳۰٪').length).toBeGreaterThan(0);
    expect(screen.getByText('۶۵٪ استفاده شده')).toBeInTheDocument();
    expect(screen.getAllByText('خرید').length).toBeGreaterThan(0);
    expect(screen.getByText(/نمونه نمایشی/)).toBeInTheDocument();
    expect(screen.getByText('هنوز تغییری در اعتبار حساب ثبت نشده است.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت درخواست' })).toBeInTheDocument();
  });

  it('shows an inactive account without fake balances', () => {
    render(
      <CreditPage
        accountMissing
        entries={[]}
        orders={[]}
        trend={trend}
        period="30d"
        onPeriodChange={() => undefined}
      />,
    );
    expect(screen.getByText('اعتبار معاملاتی برای حساب شما فعال نشده است.')).toBeInTheDocument();
    expect(screen.queryByText('سقف اعتبار شما')).not.toBeInTheDocument();
  });

  it('shows a retry without the raw API message', async () => {
    const onRetry = jest.fn();
    render(
      <CreditPage
        accountError
        onRetryAccount={onRetry}
        entries={[]}
        orders={[]}
        trend={trend}
        period="30d"
        onPeriodChange={() => undefined}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('اطلاعات اعتبار در حال حاضر قابل دریافت نیست.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Insufficient');
    await userEvent.click(screen.getByRole('button', { name: 'تلاش مجدد' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows skeletons instead of amounts while loading', () => {
    render(
      <CreditPage
        accountLoading
        entries={[]}
        orders={[]}
        trend={trend}
        period="30d"
        onPeriodChange={() => undefined}
      />,
    );
    expect(screen.queryByText('سقف اعتبار شما')).not.toBeInTheDocument();
    expect(screen.queryByText('۵,۰۰۰,۰۰۰,۰۰۰')).not.toBeInTheDocument();
  });
});
