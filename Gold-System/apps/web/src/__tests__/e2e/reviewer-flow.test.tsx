import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssignmentsPage from '@/app/dashboard/assignments/page';
import { ReviewContextPanel } from '@/components/dashboard/review-panel';
import type { ReviewContext } from '@/lib/internal-api';
import { visibleNav } from '@/lib/nav';
import { signIn } from '../dashboard/auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('../dashboard/auth-state').authState,
}));

jest.mock('@/lib/internal-api', () => ({
  assignmentsApi: {
    list: jest.fn(),
    startReview: jest.fn(),
    assign: jest.fn(),
  },
  internalOrdersApi: {
    approve: jest.fn().mockResolvedValue({}),
    reject: jest.fn().mockResolvedValue({}),
    requestRevision: jest.fn(),
  },
  internalTradesApi: { confirm: jest.fn() },
}));

const api = jest.requireMock('@/lib/internal-api') as {
  assignmentsApi: { list: jest.Mock };
  internalOrdersApi: { reject: jest.Mock };
};

const context = {
  order: {
    id: 'ord-1',
    orderNumber: 'ORD-R',
    status: 'UNDER_REVIEW',
    totalAmountRial: '20.00',
    reservedAmountRial: '20.00',
    weightGrams: '1.000000',
    purityRatio: '0.750000',
    customerType: null,
    submittedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  customer: {
    id: 'c1',
    customerNumber: 'C-1',
    firstName: 'ر',
    lastName: 'بررسی',
    nationalId: '1',
    mobile: '0912',
    type: null,
    status: 'ACTIVE',
    kycStatus: 'APPROVED',
  },
  account: null,
  quotation: null,
  activeAssignment: null,
} as ReviewContext;

describe('reviewer flow', () => {
  it('opens the review queue and rejects an order with a reason', async () => {
    const permissions = ['trade.review', 'trade.reject', 'trade.approve'];
    signIn(permissions, ['reviewer']);
    expect(visibleNav(permissions).map((item) => item.href)).toContain('/dashboard/assignments');
    api.assignmentsApi.list.mockResolvedValue({
      assignments: [
        {
          id: 'as-1',
          orderId: 'ord-1',
          quotationId: 'q1',
          assignedToId: 'staff-1',
          assignedById: 'staff-2',
          status: 'ACTIVE',
          notes: null,
          completedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    const queue = render(<AssignmentsPage />);
    expect(await screen.findByRole('link', { name: 'مشاهده' })).toHaveAttribute(
      'href',
      '/dashboard/orders/ord-1',
    );
    queue.unmount();

    render(<ReviewContextPanel context={context} onChanged={jest.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'رد سفارش' }));
    await user.type(screen.getByLabelText('دلیل'), 'وزن با درخواست نمی‌خواند');
    const buttons = screen.getAllByRole('button', { name: 'تأیید' });
    await user.click(buttons[buttons.length - 1]!);
    expect(api.internalOrdersApi.reject).toHaveBeenCalledWith('ord-1', 'وزن با درخواست نمی‌خواند');
  });
});
