import React from 'react';
import { render, screen } from '@testing-library/react';
import PaymentsPage from '@/app/dashboard/payments/page';
import FinancialLedgerPage from '@/app/dashboard/ledger/financial/page';
import { SettlementSummary } from '@/components/dashboard/payment-panel';
import { visibleNav } from '@/lib/nav';
import { signIn } from '../dashboard/auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('../dashboard/auth-state').authState,
}));

jest.mock('@/lib/internal-api', () => ({
  internalPaymentsApi: { list: jest.fn() },
  financialLedgerApi: {
    accounts: jest.fn(),
    balances: jest.fn(),
    journals: jest.fn(),
  },
}));

const api = jest.requireMock('@/lib/internal-api') as {
  internalPaymentsApi: { list: jest.Mock };
  financialLedgerApi: { accounts: jest.Mock; balances: jest.Mock; journals: jest.Mock };
};

describe('accountant flow', () => {
  it('opens payments, settlement figures and the financial ledger', async () => {
    const permissions = ['payment.read', 'settlement.read', 'ledger.read'];
    signIn(permissions, ['accountant']);
    const hrefs = visibleNav(permissions).map((item) => item.href);
    expect(hrefs).toEqual(
      expect.arrayContaining(['/dashboard/payments', '/dashboard/settlements', '/dashboard/ledger/financial']),
    );

    api.internalPaymentsApi.list.mockResolvedValue([
      {
        id: 'pay-1',
        tradeId: 'tr-1',
        customerId: 'c1',
        method: 'CASH',
        amount: '80.00',
        currency: 'IRR',
        status: 'PENDING',
        referenceNumber: 'R-8',
        notes: null,
        receivedAt: null,
        validatedAt: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]);
    const payments = render(<PaymentsPage />);
    expect(await screen.findByText('R-8')).toBeInTheDocument();
    payments.unmount();

    render(<SettlementSummary total="100.00" settled="80.00" status="جزئی" settledAt={null} />);
    expect(screen.getByText(/۸۰/)).toBeInTheDocument();

    api.financialLedgerApi.accounts.mockResolvedValue([
      { code: 'FA-01', name: 'Cash', nameFa: 'صندوق', active: true, blockedReason: null },
    ]);
    api.financialLedgerApi.balances.mockResolvedValue([
      { accountCode: 'FA-01', totalDebit: '80.00', totalCredit: '0.00', balance: '80.00', currency: 'IRR' },
    ]);
    api.financialLedgerApi.journals.mockResolvedValue({ journals: [], total: 0, limit: 20, offset: 0 });
    render(<FinancialLedgerPage />);
    expect(await screen.findByText('صندوق')).toBeInTheDocument();
  });
});
