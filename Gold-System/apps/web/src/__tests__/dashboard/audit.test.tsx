import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuditPage from '@/app/dashboard/audit/page';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('@/lib/internal-api', () => ({
  reportsApi: {
    audit: jest.fn(),
  },
}));

const { reportsApi } = jest.requireMock('@/lib/internal-api') as {
  reportsApi: { audit: jest.Mock };
};

describe('audit log', () => {
  it('is hidden without ledger.read and has no edit action', async () => {
    signIn(['reports']);
    const { rerender } = render(<AuditPage />);
    expect(screen.getByText(/ledger.read/)).toBeInTheDocument();

    signIn(['ledger.read']);
    reportsApi.audit.mockResolvedValue({
      total: 1,
      logs: [
        {
          id: 'a1',
          actorId: 'user-9',
          actorType: 'USER',
          action: 'ORDER_APPROVED',
          entityType: 'Order',
          entityId: 'ord-1',
          before: null,
          after: null,
          reason: 'بررسی شد',
          ipAddress: null,
          createdAt: '2026-05-01T00:00:00.000Z',
        },
      ],
    });
    rerender(<AuditPage />);
    expect(await screen.findByText('ORDER_APPROVED')).toBeInTheDocument();
    expect(screen.getByText('بررسی شد')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /حذف/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ویرایش/ })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('عمل'), 'ORDER_APPROVED');
    await user.click(screen.getByRole('button', { name: 'اعمال فیلتر' }));
    expect(reportsApi.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ORDER_APPROVED' }),
    );
  });
});
