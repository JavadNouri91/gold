import React from 'react';
import { render, screen } from '@testing-library/react';
import OrderDetailPage from '@/app/dashboard/orders/[id]/page';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('@/lib/internal-api', () => ({
  assignmentsApi: { reviewContext: jest.fn() },
  internalOrdersApi: { getById: jest.fn(), quotations: jest.fn() },
}));

const api = jest.requireMock('@/lib/internal-api') as {
  assignmentsApi: { reviewContext: jest.Mock };
  internalOrdersApi: { getById: jest.Mock; quotations: jest.Mock };
};

describe('dashboard order detail pricing', () => {
  it('shows spot price at registration, fee, wage and total', async () => {
    signIn(['order.read']);
    api.internalOrdersApi.getById.mockResolvedValue({
      id: 'ord-1',
      orderNumber: 'ORD-44',
      customerId: 'c1',
      status: 'ASSIGNED',
      totalAmountRial: '12600000.00',
      goldAmountRial: '12350000.00',
      feeAmountRial: '150000.00',
      step1BasePrice: '12350000.000000',
      wageAmount: '100000.00',
      reservedAmountRial: '12600000.00',
      weightGrams: '1.000000',
      purityRatio: '0.750000',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      charges: [
        {
          code: 'BUY_FEE',
          labelFa: 'کارمزد خرید',
          side: 'BUY',
          mode: 'FIXED',
          rateValue: '150000',
          calculationBase: null,
          baseAmount: '0',
          amount: '150000.00',
        },
      ],
    });
    api.internalOrdersApi.quotations.mockResolvedValue([]);

    render(<OrderDetailPage params={{ id: 'ord-1' }} />);

    expect(await screen.findByText('قیمت لحظه‌ای ثبت سفارش')).toBeInTheDocument();
    expect(screen.getByText('کارمزد خرید (مبلغ ثابت)')).toBeInTheDocument();
    expect(screen.getByText('اجرت')).toBeInTheDocument();
    expect(screen.getByText('جمع کل')).toBeInTheDocument();
  });

  it('shows a percentage fee rate on the charge line', async () => {
    signIn(['order.read']);
    api.internalOrdersApi.getById.mockResolvedValue({
      id: 'ord-2',
      orderNumber: 'ORD-45',
      customerId: 'c1',
      status: 'ASSIGNED',
      totalAmountRial: '10200000.00',
      feeAmountRial: '200000.00',
      step1BasePrice: '10000000.000000',
      wageAmount: '0.00',
      reservedAmountRial: '10200000.00',
      weightGrams: '1.000000',
      purityRatio: '0.750000',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      charges: [
        {
          code: 'BUY_FEE',
          labelFa: 'کارمزد خرید',
          side: 'BUY',
          mode: 'PERCENTAGE',
          rateValue: '2.000000',
          calculationBase: 'GOLD_COMMERCIAL_TOTAL',
          baseAmount: '10000000.00',
          amount: '200000.00',
        },
      ],
    });
    api.internalOrdersApi.quotations.mockResolvedValue([]);

    render(<OrderDetailPage params={{ id: 'ord-2' }} />);

    expect(await screen.findByText('کارمزد خرید (۲٪)')).toBeInTheDocument();
  });
});
