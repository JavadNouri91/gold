import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import DashboardPage from '@/app/portal/dashboard/page';
import { ApiClientError } from '@/lib/api';

const mockGetMe = jest.fn();
const mockGetAccount = jest.fn();
const mockGetPrice = jest.fn();
const mockListOrders = jest.fn();
const mockListTrades = jest.fn();
const mockPortfolio = jest.fn();

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    customerApi: {
      getMe: (...args: unknown[]) => mockGetMe(...args),
      getMyAccount: (...args: unknown[]) => mockGetAccount(...args),
    },
    pricingApi: {
      getCurrentPrice: (...args: unknown[]) => mockGetPrice(...args),
    },
    ordersApi: {
      list: (...args: unknown[]) => mockListOrders(...args),
      portfolio: (...args: unknown[]) => mockPortfolio(...args),
    },
    tradesApi: {
      list: (...args: unknown[]) => mockListTrades(...args),
    },
  };
});

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <DashboardPage />
    </SWRConfig>,
  );
}

beforeEach(() => {
  mockGetMe.mockReset();
  mockGetAccount.mockReset();
  mockGetPrice.mockReset();
  mockListOrders.mockReset();
  mockListTrades.mockReset();
  mockPortfolio.mockReset();
  mockGetAccount.mockRejectedValue(new ApiClientError('NOT_FOUND', 'missing', 404));
  mockGetPrice.mockResolvedValue(null);
  mockListOrders.mockResolvedValue({ data: [] });
  mockListTrades.mockResolvedValue({ data: [] });
  mockPortfolio.mockResolvedValue(null);
});

describe('portal dashboard customer profile', () => {
  it('does not treat a missing customer profile as a load failure', async () => {
    mockGetMe.mockRejectedValue(new ApiClientError('NOT_FOUND', 'missing', 404));

    renderPage();

    expect(
      await screen.findByText('پروفایل مشتری برای این حساب کاربری ثبت نشده است.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('خطا در بارگذاری اطلاعات مشتری')).not.toBeInTheDocument();
  });

  it('still reports unexpected customer API failures', async () => {
    mockGetMe.mockRejectedValue(new ApiClientError('INTERNAL_ERROR', 'boom', 500));

    renderPage();

    expect(await screen.findByText('خطا در بارگذاری اطلاعات مشتری')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByText('پروفایل مشتری برای این حساب کاربری ثبت نشده است.'),
      ).not.toBeInTheDocument();
    });
  });
});
