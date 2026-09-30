import React from 'react';
import { render, screen } from '@testing-library/react';
import { PermissionGate, ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { signIn, signOut } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

describe('permission gate', () => {
  it('hides an action when the permission is missing', () => {
    signIn(['order.read']);
    render(
      <PermissionGate anyOf="trade.approve">
        <button>تأیید سفارش</button>
      </PermissionGate>,
    );
    expect(screen.queryByText('تأیید سفارش')).not.toBeInTheDocument();
  });

  it('shows an action when the permission is present', () => {
    signIn(['trade.approve']);
    render(
      <PermissionGate anyOf="trade.approve">
        <button>تأیید سفارش</button>
      </PermissionGate>,
    );
    expect(screen.getByText('تأیید سفارش')).toBeInTheDocument();
  });

  it('explains that a hidden menu is not the security boundary', () => {
    signOut();
    render(<ForbiddenNotice permission="ledger.read" />);
    expect(screen.getByText(/ledger.read/)).toBeInTheDocument();
    expect(screen.getByText(/سرور/)).toBeInTheDocument();
  });
});
