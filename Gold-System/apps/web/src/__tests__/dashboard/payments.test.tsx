import React from 'react';
import { render, screen } from '@testing-library/react';
import { PaymentActionPanel, SettlementSummary } from '@/components/dashboard/payment-panel';
import type { StaffPayment } from '@/lib/internal-api';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

const payment: StaffPayment = {
  id: 'pay-1',
  tradeId: 'tr-1',
  customerId: 'c1',
  method: 'CASH',
  amount: '1500.00',
  currency: 'IRR',
  status: 'VALIDATED',
  referenceNumber: 'REF-1',
  notes: null,
  receivedAt: null,
  validatedAt: null,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
};

describe('payments', () => {
  it('shows validate and allocate only for the matching permissions', () => {
    signIn(['payment.validate']);
    const { rerender } = render(<PaymentActionPanel payment={payment} onChanged={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'تأیید پرداخت' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تخصیص به معامله' })).not.toBeInTheDocument();

    signIn(['payment.allocate']);
    rerender(<PaymentActionPanel payment={payment} onChanged={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'تخصیص به معامله' })).toBeInTheDocument();
  });
});

describe('settlement', () => {
  it('prints the settled amount supplied by the API', () => {
    render(
      <SettlementSummary
        total="2000.00"
        settled="500.25"
        status="تسویه جزئی"
        settledAt="2026-03-02T00:00:00.000Z"
      />,
    );
    expect(screen.getByText(/۵۰۰\.۲۵/)).toBeInTheDocument();
    expect(screen.getByText(/تسویه جزئی/)).toBeInTheDocument();
  });
});
