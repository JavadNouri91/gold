import React from 'react';
import { render, screen } from '@testing-library/react';
import { ReviewContextPanel } from '@/components/dashboard/review-panel';
import type { ReviewContext } from '@/lib/internal-api';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('@/lib/internal-api', () => ({
  assignmentsApi: { startReview: jest.fn(), assign: jest.fn() },
  internalOrdersApi: { approve: jest.fn(), reject: jest.fn(), requestRevision: jest.fn() },
  internalTradesApi: { confirm: jest.fn() },
}));

const context: ReviewContext = {
  order: {
    id: 'ord-1',
    orderNumber: 'ORD-9',
    status: 'UNDER_REVIEW',
    totalAmountRial: '1000.00',
    reservedAmountRial: '1000.00',
    weightGrams: '2.500000',
    purityRatio: '0.750000',
    customerType: 'HOUSEHOLD',
    submittedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  customer: {
    id: 'c1',
    customerNumber: 'C-1',
    firstName: 'مریم',
    lastName: 'کاظمی',
    nationalId: '1',
    mobile: '0912',
    type: 'HOUSEHOLD',
    status: 'ACTIVE',
    kycStatus: 'APPROVED',
  },
  account: {
    id: 'a1',
    status: 'ACTIVE',
    creditLimitRial: '5000.00',
    reservedCreditRial: '1000.00',
    consumedCreditRial: '0.00',
    availableCreditRial: '4000.00',
  },
  quotation: {
    id: 'q1',
    quotationNumber: 'Q-1',
    version: 1,
    status: 'ACTIVE',
    totalAmountRial: '1000.00',
    weightGrams: '2.500000',
    purityRatio: '0.750000',
    step1BasePrice: null,
    wageAmount: null,
    discountAmount: null,
    roundingAmount: null,
    isComplete: false,
    documentKey: null,
    generatedAt: '2026-01-01T00:00:00.000Z',
  },
  activeAssignment: null,
};

describe('order review', () => {
  it('shows approval only for the trade.approve permission and keeps the order number', () => {
    signIn(['trade.review', 'trade.approve']);
    render(<ReviewContextPanel context={context} onChanged={jest.fn()} />);
    expect(screen.getByText('ORD-9')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأیید سفارش' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'شروع بررسی' })).toBeInTheDocument();
  });

  it('hides approval from an operator who can only assign', () => {
    signIn(['order.assign']);
    render(<ReviewContextPanel context={context} onChanged={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'تأیید سفارش' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تخصیص بررسی‌کننده' })).toBeInTheDocument();
  });
});
