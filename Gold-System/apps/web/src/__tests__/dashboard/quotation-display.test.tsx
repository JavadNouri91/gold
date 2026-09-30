import React from 'react';
import { render, screen } from '@testing-library/react';
import QuotationDetailPage from '@/app/dashboard/quotations/[id]/page';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('@/lib/internal-api', () => ({
  internalQuotationsApi: {
    getById: jest.fn(),
    download: jest.fn(),
  },
}));

const { internalQuotationsApi } = jest.requireMock('@/lib/internal-api') as {
  internalQuotationsApi: { getById: jest.Mock };
};

describe('quotation display', () => {
  it('shows the locked snapshot and does not offer a download when the document is absent', async () => {
    signIn(['quotation.read']);
    internalQuotationsApi.getById.mockResolvedValue({
      id: 'q1',
      quotationNumber: 'QT-44',
      orderId: 'ord-1',
      customerId: 'c1',
      pricingCalculationId: 'calc-1',
      version: 2,
      status: 'ACTIVE',
      totalAmountRial: '2500000.50',
      weightGrams: '10.000000',
      purityRatio: '0.750000',
      step1BasePrice: '100.000000',
      wageAmount: '10.00',
      discountAmount: '0.00',
      roundingAmount: '0.50',
      isComplete: false,
      documentAvailable: false,
      generatedAt: '2026-02-01T00:00:00.000Z',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
      items: [],
    });
    render(<QuotationDetailPage params={{ id: 'q1' }} />);
    expect(await screen.findByText('QT-44')).toBeInTheDocument();
    expect(screen.getByText(/مقادیر تاریخی دوباره محاسبه نمی‌شوند/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'دریافت سند' })).not.toBeInTheDocument();
  });
});
