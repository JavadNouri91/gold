import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewContextPanel } from '@/components/dashboard/review-panel';
import type { ReviewContext } from '@/lib/internal-api';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('@/lib/internal-api', () => ({
  assignmentsApi: { startReview: jest.fn(), assign: jest.fn(), claim: jest.fn() },
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
    expect(screen.getByRole('button', { name: 'تأیید نهایی' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'شروع بررسی' })).not.toBeInTheDocument();
  });

  it('lets a quoted order be approved without assignment', () => {
    signIn(['trade.review', 'trade.approve', 'trade.reject', 'trade.request_revision']);
    render(
      <ReviewContextPanel
        context={{ ...context, order: { ...context.order, status: 'QUOTED' } }}
        onChanged={jest.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'برداشت برای بررسی' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تخصیص بررسی‌کننده' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأیید نهایی' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'رد سفارش' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'درخواست اصلاح' })).toBeInTheDocument();
  });

  it('lets an assigned order be approved or rejected without starting review', () => {
    signIn(['trade.review', 'trade.approve', 'trade.reject', 'trade.request_revision']);
    render(
      <ReviewContextPanel
        context={{ ...context, order: { ...context.order, status: 'ASSIGNED' } }}
        onChanged={jest.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'شروع بررسی' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأیید نهایی' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'رد سفارش' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'درخواست اصلاح' })).toBeInTheDocument();
  });

  it('asks for confirmation without a reason on approve, and requires a reason on reject', async () => {
    signIn(['trade.review', 'trade.approve', 'trade.reject']);
    const user = userEvent.setup();
    render(<ReviewContextPanel context={context} onChanged={jest.fn()} />);

    await user.click(screen.getByRole('button', { name: 'تأیید نهایی' }));
    expect(screen.getByText('با تأیید نهایی، معامله ساخته می‌شود و اعتبار رزروشده مصرف می‌گردد.')).toBeInTheDocument();
    expect(screen.queryByLabelText('دلیل')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'انصراف' }));

    await user.click(screen.getByRole('button', { name: 'رد سفارش' }));
    expect(screen.getByLabelText(/دلیل/)).toBeRequired();
  });

  it('hides approval from an operator who can only assign', () => {
    signIn(['order.assign']);
    render(
      <ReviewContextPanel
        context={{ ...context, order: { ...context.order, status: 'QUOTED' } }}
        onChanged={jest.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'تأیید نهایی' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تخصیص بررسی‌کننده' })).not.toBeInTheDocument();
  });
});
