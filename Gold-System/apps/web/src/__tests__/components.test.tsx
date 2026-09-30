/**
 * Component tests for UI primitives and portal components.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../components/ui/button';
import { Alert, EmptyState } from '../components/ui/alert';
import { Spinner, PageSpinner } from '../components/ui/spinner';
import { CreditSummary } from '../components/portal/credit-summary';
import type { CustomerAccount } from '../lib/api';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>ثبت سفارش</Button>);
    expect(screen.getByText('ثبت سفارش')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<Button isLoading>ثبت</Button>);
    expect(screen.getByText('در حال پردازش…')).toBeInTheDocument();
  });

  it('is disabled when loading', () => {
    render(<Button isLoading>ثبت</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
  });

  it('calls onClick', () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>کلیک</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', () => {
    const onClick = jest.fn();
    render(<Button disabled onClick={onClick}>کلیک</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies destructive variant classes', () => {
    render(<Button variant="destructive">حذف</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('red');
  });
});

describe('Alert', () => {
  it('renders children', () => {
    render(<Alert>پیام خطا</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('پیام خطا');
  });

  it('renders title when provided', () => {
    render(<Alert title="عنوان">متن</Alert>);
    expect(screen.getByText('عنوان')).toBeInTheDocument();
  });

  it('applies error variant', () => {
    render(<Alert variant="error">خطا</Alert>);
    const el = screen.getByRole('alert');
    expect(el.className).toContain('red');
  });

  it('applies success variant', () => {
    render(<Alert variant="success">موفق</Alert>);
    const el = screen.getByRole('alert');
    expect(el.className).toContain('green');
  });
});

describe('EmptyState', () => {
  it('renders message', () => {
    render(<EmptyState message="هیچ موردی یافت نشد" />);
    expect(screen.getByText('هیچ موردی یافت نشد')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<EmptyState message="خالی" description="توضیح" />);
    expect(screen.getByText('توضیح')).toBeInTheDocument();
  });
});

describe('Spinner', () => {
  it('renders spinner with aria-label', () => {
    render(<Spinner />);
    expect(screen.getByLabelText('در حال بارگذاری')).toBeInTheDocument();
  });

  it('PageSpinner renders in a container', () => {
    render(<PageSpinner />);
    expect(screen.getByLabelText('در حال بارگذاری')).toBeInTheDocument();
  });
});

describe('CreditSummary', () => {
  const mockAccount: CustomerAccount = {
    id: 'acc-1',
    customerId: 'c-1',
    status: 'ACTIVE',
    creditLimitRial: '10000000.00',
    reservedCreditRial: '2000000.00',
    consumedCreditRial: '1000000.00',
    availableCreditRial: '7000000.00',
    creditLimitGoldRial: '0.00',
    reservedCreditGoldRial: '0.00',
    consumedCreditGoldRial: '0.00',
  };

  it('renders available credit label', () => {
    render(<CreditSummary account={mockAccount} />);
    expect(screen.getByText('اعتبار در دسترس')).toBeInTheDocument();
  });

  it('renders reserved credit label', () => {
    render(<CreditSummary account={mockAccount} />);
    expect(screen.getByText('اعتبار رزرو شده')).toBeInTheDocument();
  });

  it('renders consumed credit label', () => {
    render(<CreditSummary account={mockAccount} />);
    expect(screen.getByText('اعتبار مصرف شده')).toBeInTheDocument();
  });

  it('displays credit values', () => {
    render(<CreditSummary account={mockAccount} />);
    // Available: 7,000,000
    const text = screen.getAllByText(/ریال/);
    expect(text.length).toBeGreaterThanOrEqual(3);
  });
});
