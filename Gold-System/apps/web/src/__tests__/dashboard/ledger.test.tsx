import React from 'react';
import { render, screen } from '@testing-library/react';
import { LedgerTable, GoldLedgerTable } from '@/components/dashboard/ledger-tables';

describe('ledger views', () => {
  it('renders debit and credit from the journal payload', () => {
    render(
      <LedgerTable
        journals={[
          {
            id: 'j1',
            sourceType: 'PAYMENT',
            sourceId: 'pay-1',
            description: null,
            postedAt: '2026-04-01T00:00:00.000Z',
            totalDebits: '10.00',
            totalCredits: '10.00',
            isBalanced: true,
            entries: [
              {
                id: 'e1',
                accountCode: 'FA-01',
                accountName: 'صندوق',
                debit: '10.00',
                credit: '0.00',
                description: 'دریافت',
                createdAt: '2026-04-01T00:00:00.000Z',
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText(/صندوق/)).toBeInTheDocument();
    expect(screen.getByText('دریافت')).toBeInTheDocument();
  });

  it('renders gold quantity strings without recalculating them', () => {
    render(
      <GoldLedgerTable
        journals={[
          {
            id: 'g1',
            sourceType: 'TRADE_CONFIRM',
            sourceId: 'tr-1',
            description: null,
            postedAt: '2026-04-01T00:00:00.000Z',
            entries: [
              {
                id: 'ge1',
                accountCode: 'GA-01',
                accountName: 'موجودی فروشگاه',
                direction: 'OUT',
                quantity: '1.250000',
                purity: '0.750000',
                description: null,
                createdAt: '2026-04-01T00:00:00.000Z',
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText(/موجودی فروشگاه/)).toBeInTheDocument();
    expect(screen.getByText('0.750000')).toBeInTheDocument();
  });
});
