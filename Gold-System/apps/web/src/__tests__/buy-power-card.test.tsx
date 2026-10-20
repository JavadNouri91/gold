import React from 'react';
import { render, screen } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { CurrentPrice, CustomerAccount } from '@/lib/api';
import { BuyPowerCard } from '@/components/portal/buy-power-card';
import { formatWeight } from '@/lib/utils';

const mockGetAccount = jest.fn();

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    customerApi: {
      ...actual.customerApi,
      getMyAccount: (...args: unknown[]) => mockGetAccount(...args),
    },
  };
});

const price: CurrentPrice = {
  normalizedValue: '50000000.00',
  unit: 'IRR_PER_GRAM',
  capturedAt: '2026-10-17T10:00:00.000Z',
  validityStatus: 'VALID',
};

const account: CustomerAccount = {
  id: 'acc-1',
  customerId: 'c-1',
  status: 'ACTIVE',
  creditLimitRial: '200000000.00',
  reservedCreditRial: '0.00',
  consumedCreditRial: '0.00',
  creditLimitGoldRial: '0.00',
  reservedCreditGoldRial: '0.00',
  consumedCreditGoldRial: '0.00',
  availableCreditRial: '1.00',
  availableRial: '100000000.00',
};

function renderCard(live?: CurrentPrice) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <BuyPowerCard price={live} />
    </SWRConfig>,
  );
}

beforeEach(() => {
  mockGetAccount.mockReset();
  mockGetAccount.mockResolvedValue(account);
});

describe('BuyPowerCard', () => {
  it('shows grams from purchasing power and the live gram price', async () => {
    renderCard(price);
    expect(await screen.findByText(/معادل/)).toBeInTheDocument();
    expect(screen.getByText(formatWeight('2'), { exact: false })).toBeInTheDocument();
    expect(screen.getByText('توان خرید')).toBeInTheDocument();
  });

  it('does not invent grams when the live price is missing', async () => {
    renderCard(undefined);
    expect(await screen.findByText('قیمت لحظه‌ای طلا در دسترس نیست.')).toBeInTheDocument();
  });
});
