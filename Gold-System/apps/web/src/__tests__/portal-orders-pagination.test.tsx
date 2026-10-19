import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import OrdersPage from '../app/portal/orders/page';
import type { ListOrdersResponse, Order } from '../lib/api';
import { toPersianDigits } from '../lib/utils';

const list = jest.fn();

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return {
    ...actual,
    ordersApi: {
      ...actual.ordersApi,
      list: (...args: unknown[]) => list(...args),
    },
  };
});

function order(index: number): Order {
  return {
    id: `ord-${index}`,
    orderNumber: `ORD-${index}`,
    customerId: 'c1',
    status: 'SUBMITTED',
    totalAmountRial: '1000',
    weightGrams: '1.000',
    purityRatio: '0.750',
    side: 'BUY',
    unitPriceRial: '1000000',
    reservedAmountRial: '0',
    createdAt: '2026-10-01T08:00:00.000Z',
  };
}

function pageOf(page: number): ListOrdersResponse {
  const limit = 10;
  const total = 25;
  const start = (page - 1) * limit;
  const count = Math.min(limit, total - start);
  return {
    data: Array.from({ length: count }, (_, index) => order(start + index + 1)),
    meta: { page, limit, total, totalPages: 3 },
  };
}

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <OrdersPage />
    </SWRConfig>,
  );
}

describe('portal orders pagination', () => {
  beforeEach(() => {
    list.mockReset();
    list.mockImplementation(async (params?: { page?: number }) => pageOf(params?.page ?? 1));
  });

  it('shows Persian page numbers and requests the selected page', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('نمایش ۱ تا ۱۰ از ۲۵ سفارش')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'شماره سفارش' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'قیمت واحد' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'وضعیت' })).toBeInTheDocument();
    expect(screen.getAllByText('۱ گرم').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('list', { name: 'مراحل سفارش' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('پیش‌فاکتور در حال صدور است.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('صدور پیش‌فاکتور').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'صفحه ۱', current: 'page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'صفحه ۲' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'صفحه ۳' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'صفحه قبل' })).toBeDisabled();
    expect(list).toHaveBeenCalledWith({ limit: 10, page: 1 });

    await user.click(screen.getByRole('button', { name: 'صفحه ۲' }));

    await waitFor(() => {
      expect(list).toHaveBeenCalledWith({ limit: 10, page: 2 });
    });
    expect(await screen.findByText('نمایش ۱۱ تا ۲۰ از ۲۵ سفارش')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'صفحه ۲', current: 'page' })).toBeInTheDocument();
    expect(screen.getAllByText(toPersianDigits('ORD-11')).length).toBeGreaterThan(0);
  });
});
