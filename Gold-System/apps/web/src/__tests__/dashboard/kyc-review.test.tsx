import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KycDecisionPanel } from '@/components/dashboard/kyc-panel';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('@/lib/internal-api', () => ({
  internalKycApi: {
    getDocuments: jest.fn().mockResolvedValue([]),
    startReview: jest.fn(),
    decide: jest.fn().mockResolvedValue({}),
    history: jest.fn(),
  },
}));

const { internalKycApi } = jest.requireMock('@/lib/internal-api') as {
  internalKycApi: { decide: jest.Mock };
};

describe('KYC review', () => {
  it('submits a rejection reason through the backend decision endpoint', async () => {
    signIn(['kyc.review']);
    const user = userEvent.setup();
    render(<KycDecisionPanel customerId="cust-1" />);
    await user.click(screen.getByRole('button', { name: 'رد' }));
    await user.type(screen.getByLabelText('دلیل'), 'مدارک ناخوانا و ناقص است');
    const confirmButtons = screen.getAllByRole('button', { name: 'تأیید' });
    await user.click(confirmButtons[confirmButtons.length - 1]!);
    expect(internalKycApi.decide).toHaveBeenCalledWith(
      'cust-1',
      'REJECT',
      'مدارک ناخوانا و ناقص است',
    );
  });

  it('does not offer a decision to a user without kyc.review', () => {
    signIn(['customer.read']);
    render(<KycDecisionPanel customerId="cust-1" />);
    expect(screen.queryByRole('button', { name: 'رد' })).not.toBeInTheDocument();
  });
});
