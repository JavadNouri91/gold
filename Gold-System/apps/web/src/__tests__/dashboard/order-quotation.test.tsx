import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderQuotationActions } from '@/components/dashboard/order-quotation-actions';
import { toPersianDigits } from '@/lib/utils';

jest.mock('@/lib/internal-api', () => ({
  internalOrdersApi: { quotations: jest.fn() },
  internalQuotationsApi: { download: jest.fn(), getById: jest.fn() },
}));

const api = jest.requireMock('@/lib/internal-api') as {
  internalOrdersApi: { quotations: jest.Mock };
};

describe('order quotation modal', () => {
  it('opens the quotation in a dialog from نمایش', async () => {
    const user = userEvent.setup();
    api.internalOrdersApi.quotations.mockResolvedValue([
      {
        id: 'q1',
        quotationNumber: 'QT-21',
        orderId: 'ord-1',
        customerId: 'c1',
        pricingCalculationId: 'calc-1',
        version: 1,
        status: 'ACTIVE',
        totalAmountRial: '1000.00',
        weightGrams: '1.000000',
        purityRatio: '0.750000',
        step1BasePrice: '100.00',
        wageAmount: '0.00',
        discountAmount: '0.00',
        roundingAmount: '0.00',
        isComplete: false,
        documentAvailable: false,
        generatedAt: '2026-02-01T00:00:00.000Z',
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
        items: [],
      },
    ]);
    render(<OrderQuotationActions orderId="ord-1" status="QUOTED" />);
    await user.click(screen.getByRole('button', { name: 'نمایش' }));
    expect(await screen.findByRole('dialog', { name: 'پیش‌فاکتور' })).toBeInTheDocument();
    expect(screen.getByText(toPersianDigits('QT-21'))).toBeInTheDocument();
  });
});
