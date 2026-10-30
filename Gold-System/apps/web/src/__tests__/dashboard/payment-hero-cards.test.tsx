import React from 'react';
import { render, screen } from '@testing-library/react';
import { PaymentHeroCards } from '@/components/dashboard/payment-hero-cards';
import type { StaffPaymentSummary } from '@/lib/internal-api';

const summary: StaffPaymentSummary = {
  deposits: {
    pendingCount: 5,
    pendingAmountRial: '1500000.00',
    todayValidatedAmountRial: '1000000.00',
    totalSuccessfulAmountRial: '5000000.00',
    totalCount: 9,
  },
  withdrawals: {
    pendingCount: 2,
    pendingAmountRial: '8000000.00',
    todayValidatedAmountRial: '3000000.00',
    totalSuccessfulAmountRial: '12000000.00',
    totalCount: 3,
  },
};

describe('PaymentHeroCards', () => {
  it('shows the four deposit metrics with pending count', () => {
    render(<PaymentHeroCards summary={summary} direction="DEPOSIT" />);

    expect(screen.getByText('مجموع واریزی‌های تأییدشده')).toBeInTheDocument();
    expect(screen.getByText('واریز امروز')).toBeInTheDocument();
    expect(screen.getByText('در انتظار تأیید')).toBeInTheDocument();
    expect(screen.getByText('تعداد کل')).toBeInTheDocument();
    expect(screen.getByText('۵ مورد')).toBeInTheDocument();
    expect(screen.getByText('۹')).toBeInTheDocument();
  });

  it('shows the four withdrawal metrics with pending count', () => {
    render(<PaymentHeroCards summary={summary} direction="WITHDRAWAL" />);

    expect(screen.getByText('مجموع برداشت‌های تأییدشده')).toBeInTheDocument();
    expect(screen.getByText('برداشت امروز')).toBeInTheDocument();
    expect(screen.getByText('در انتظار تأیید')).toBeInTheDocument();
    expect(screen.getByText('تعداد کل')).toBeInTheDocument();
    expect(screen.getByText('۲ مورد')).toBeInTheDocument();
    expect(screen.getByText('۳')).toBeInTheDocument();
  });

  it('renders a loading skeleton when loading', () => {
    render(<PaymentHeroCards summary={summary} direction="DEPOSIT" isLoading />);

    expect(screen.getByLabelText('در حال بارگذاری')).toBeInTheDocument();
  });

  it('falls back to em-dash when there is no summary', () => {
    render(<PaymentHeroCards summary={null} direction="DEPOSIT" />);

    expect(screen.getByText('مجموع واریزی‌های تأییدشده')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
