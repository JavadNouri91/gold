import React from 'react';
import { render, screen } from '@testing-library/react';
import { OrderRemainingSteps, OrderTimeline } from '@/components/portal/order-remaining-steps';

describe('OrderRemainingSteps', () => {
  it('renders a horizontal timeline with current step highlighted', () => {
    render(<OrderRemainingSteps status="QUOTED" />);

    const list = screen.getByRole('list', { name: 'مراحل سفارش' });
    expect(list).toBeInTheDocument();
    expect(list.className).toMatch(/flex/);

    expect(screen.getByText('بررسی طلافروش')).toBeInTheDocument();
    expect(screen.getByText('در انتظار بررسی طلافروش.')).toBeInTheDocument();
  });

  it('shows completion message when order is completed', () => {
    render(<OrderRemainingSteps status="COMPLETED" />);
    expect(screen.getByText('مسیر سفارش تکمیل شده است.')).toBeInTheDocument();
  });

  it('keeps compact mode as short text only', () => {
    render(<OrderRemainingSteps status="APPROVED" compact />);
    expect(screen.queryByRole('list', { name: 'مراحل سفارش' })).not.toBeInTheDocument();
    expect(screen.getByText('سفارش تأیید شد؛ در انتظار ایجاد معامله.')).toBeInTheDocument();
  });
});

describe('OrderTimeline', () => {
  it('keeps the horizontal list timeline for order cards', () => {
    render(<OrderTimeline status="SUBMITTED" />);
    const list = screen.getByRole('list', { name: 'مراحل سفارش' });
    expect(list.className).toMatch(/flex/);
  });
});
