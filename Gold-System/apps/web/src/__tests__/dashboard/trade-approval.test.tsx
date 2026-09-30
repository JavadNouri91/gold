import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TradeApprovalPanel } from '@/components/dashboard/trade-panel';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('@/lib/internal-api', () => ({
  internalTradesApi: {
    reverse: jest.fn().mockResolvedValue({}),
  },
}));

const { internalTradesApi } = jest.requireMock('@/lib/internal-api') as {
  internalTradesApi: { reverse: jest.Mock };
};

describe('trade approval UI', () => {
  it('asks for a reason before reversing and does not compute a second-approval threshold', async () => {
    signIn(['trade.approve']);
    const user = userEvent.setup();
    render(<TradeApprovalPanel tradeId="tr-1" status="CONFIRMED" onChanged={jest.fn()} />);
    expect(screen.getByText(/وضعیت فعلی/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'برگشت معامله' }));
    await user.type(screen.getByLabelText('دلیل'), 'اشتباه در ثبت مرجع پرداخت');
    await user.click(screen.getByRole('button', { name: 'ثبت برگشت' }));
    expect(internalTradesApi.reverse).toHaveBeenCalledWith('tr-1', 'اشتباه در ثبت مرجع پرداخت');
  });

  it('hides reversal without trade.approve', () => {
    signIn(['trade.read']);
    render(<TradeApprovalPanel tradeId="tr-1" status="CONFIRMED" onChanged={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'برگشت معامله' })).not.toBeInTheDocument();
  });
});
