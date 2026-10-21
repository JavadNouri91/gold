import React from 'react';
import { render, screen } from '@testing-library/react';
import { QuotationModal } from '@/components/dashboard/quotation-modal';
import { toPersianDigits } from '@/lib/utils';

jest.mock('@/lib/internal-api', () => ({
  internalOrdersApi: { quotations: jest.fn() },
  internalQuotationsApi: {
    getById: jest.fn(),
    download: jest.fn(),
  },
}));

const { internalQuotationsApi } = jest.requireMock('@/lib/internal-api') as {
  internalQuotationsApi: { getById: jest.Mock };
};

describe('quotation display', () => {
  it('shows the locked snapshot in a modal and does not offer a download when the document is absent', async () => {
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
    render(<QuotationModal quotationId="q1" open onClose={() => undefined} />);
    expect(await screen.findByRole('dialog', { name: 'پیش‌فاکتور' })).toBeInTheDocument();
    expect(screen.getByText(toPersianDigits('QT-44'))).toBeInTheDocument();
    expect(screen.getByText(/مقادیر تاریخی دوباره محاسبه نمی‌شوند/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'چاپ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'دریافت سند' })).not.toBeInTheDocument();
  });
});
