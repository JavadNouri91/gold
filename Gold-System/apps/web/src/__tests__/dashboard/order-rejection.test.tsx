import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RejectOrderAction } from '@/components/dashboard/reject-order-action';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({ useAuth: () => require('./auth-state').authState }));
jest.mock('@/lib/internal-api', () => ({ internalOrdersApi: { reject: jest.fn() } }));
const mutate = jest.fn().mockResolvedValue(undefined);
jest.mock('swr', () => ({ useSWRConfig: () => ({ mutate }) }));
const api = jest.requireMock('@/lib/internal-api').internalOrdersApi;
const rejectLabel = '\u0631\u062f \u0633\u0641\u0627\u0631\u0634';

beforeEach(() => {
  jest.clearAllMocks();
  signIn(['order.reject']);
});

it('hides rejection without permission and for terminal orders', () => {
  signIn([]);
  const { rerender } = render(<RejectOrderAction orderId="o1" status="UNDER_REVIEW" />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  signIn(['order.reject']);
  rerender(<RejectOrderAction orderId="o1" status="COMPLETED" />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('requires a reason, submits it, and refreshes balances and lists', async () => {
  api.reject.mockResolvedValue({ status: 'REJECTED' });
  const user = userEvent.setup();
  render(<RejectOrderAction orderId="o1" status="UNDER_REVIEW" />);
  await user.click(screen.getByRole('button', { name: rejectLabel }));
  const submit = screen.getByRole('button', { name: new RegExp('^.+ ' + rejectLabel + '$') });
  expect(submit).toBeDisabled();
  await user.type(screen.getByRole('textbox'), '  invalid order  ');
  await user.click(submit);
  await waitFor(() => expect(api.reject).toHaveBeenCalledWith('o1', 'invalid order'));
  expect(mutate).toHaveBeenCalled();
});

it('keeps the form open when rejection fails', async () => {
  api.reject.mockRejectedValue(new Error('Order changed'));
  const user = userEvent.setup();
  render(<RejectOrderAction orderId="o1" status="UNDER_REVIEW" />);
  await user.click(screen.getByRole('button', { name: rejectLabel }));
  await user.type(screen.getByRole('textbox'), 'declined');
  await user.click(screen.getByRole('button', { name: new RegExp('^.+ ' + rejectLabel + '$') }));
  expect(await screen.findByText('Order changed')).toBeInTheDocument();
  expect(mutate).not.toHaveBeenCalled();
});
