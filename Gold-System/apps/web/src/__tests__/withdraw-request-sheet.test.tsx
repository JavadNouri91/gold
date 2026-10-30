import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WithdrawRequestButton } from '@/components/portal/payments/withdraw-request-sheet';
import { customerApi, paymentsApi, type CustomerBankAccount } from '@/lib/api';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('react-iranian-bank-logo', () => ({
  IranianBank: ({ alt }: { alt?: string }) => <img alt={alt ?? ''} />,
}));

jest.mock('@/lib/api', () => ({
  ApiClientError: class ApiClientError extends Error {},
  customerApi: {
    listMyBankAccounts: jest.fn(),
  },
  paymentsApi: {
    requestWithdrawal: jest.fn(),
  },
}));

const listMyBankAccounts = customerApi.listMyBankAccounts as jest.Mock;
const requestWithdrawal = paymentsApi.requestWithdrawal as jest.Mock;

const VERIFIED_ACCOUNTS: CustomerBankAccount[] = [
  {
    id: 'ba-1',
    iban: 'IR000560000000000000000001',
    bankCode: '056',
    bankName: 'بانک سامان',
    accountHolder: 'علی رضایی',
    status: 'VERIFIED',
    createdAt: '2026-10-20T00:00:00.000Z',
  },
  {
    id: 'ba-2',
    iban: 'IR000120000000000000000001',
    bankCode: '012',
    bankName: 'بانک ملت',
    accountHolder: 'علی رضایی',
    status: 'VERIFIED',
    createdAt: '2026-10-21T00:00:00.000Z',
  },
];

/** 208,431,404 toman → rial */
const AVAILABLE_RIAL = '2084314040';

describe('WithdrawRequestButton', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    listMyBankAccounts.mockReset();
    listMyBankAccounts.mockResolvedValue([...VERIFIED_ACCOUNTS]);
    requestWithdrawal.mockReset();
    requestWithdrawal.mockResolvedValue({ id: 'pay-wd' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows available balance, daily limit, and verified bank accounts', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<WithdrawRequestButton availableRial={AVAILABLE_RIAL} />);

    await user.click(screen.getByRole('button', { name: 'درخواست برداشت وجه' }));

    expect(screen.getByRole('heading', { name: 'درخواست برداشت وجه' })).toBeInTheDocument();
    expect(screen.getByText('موجودی قابل برداشت کیف پول')).toBeInTheDocument();
    expect(screen.getByText(/سقف برداشت روزانه پایا/)).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: /بانک سامان/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /بانک ملت/ })).toBeInTheDocument();
  });

  it('shows an empty state with a profile link when no verified IBAN exists', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    listMyBankAccounts.mockResolvedValue([]);
    render(<WithdrawRequestButton availableRial={AVAILABLE_RIAL} />);

    await user.click(screen.getByRole('button', { name: 'درخواست برداشت وجه' }));

    expect(await screen.findByText('هنوز شماره شبای تأییدشده‌ای ثبت نکرده‌اید.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ثبت شماره شبا در پروفایل/ })).toHaveAttribute(
      'href',
      '/portal/profile',
    );
  });

  it('formats amount, shows words, and blocks over-balance amounts', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<WithdrawRequestButton availableRial={AVAILABLE_RIAL} />);
    await user.click(screen.getByRole('button', { name: 'درخواست برداشت وجه' }));
    await screen.findByRole('radio', { name: /بانک سامان/ });

    const amount = screen.getByLabelText('مبلغ برداشت');
    fireEvent.change(amount, { target: { value: '50000000' } });

    expect(amount).toHaveValue('۵۰,۰۰۰,۰۰۰');
    expect(screen.getByText('معادل: پنجاه میلیون تومان')).toBeInTheDocument();
    expect(screen.getByText('خلاصه تسویه')).toBeInTheDocument();
    expect(screen.getByText('کارمزد انتقال').closest('div')).toHaveTextContent('رایگان');

    fireEvent.change(amount, { target: { value: '999999999' } });
    expect(screen.getByText('مبلغ واردشده از موجودی قابل برداشت بیشتر است.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأیید و ارسال کد امنیتی پیامکی (OTP)' })).toBeDisabled();
  });

  it('applies percent presets against available balance', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<WithdrawRequestButton availableRial={AVAILABLE_RIAL} />);
    await user.click(screen.getByRole('button', { name: 'درخواست برداشت وجه' }));
    await screen.findByRole('radio', { name: /بانک سامان/ });

    await user.click(screen.getByRole('button', { name: '۵۰٪' }));
    expect(screen.getByLabelText('مبلغ برداشت')).toHaveValue('۱۰۴,۲۱۵,۷۰۲');

    await user.click(screen.getByRole('button', { name: 'برداشت کل موجودی' }));
    expect(screen.getByLabelText('مبلغ برداشت')).toHaveValue('۲۰۸,۴۳۱,۴۰۴');
  });

  it('walks through the OTP step and submits the withdrawal request', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onRequested = jest.fn();
    render(<WithdrawRequestButton availableRial={AVAILABLE_RIAL} onRequested={onRequested} />);
    await user.click(screen.getByRole('button', { name: 'درخواست برداشت وجه' }));
    await screen.findByRole('radio', { name: /بانک سامان/ });

    fireEvent.change(screen.getByLabelText('مبلغ برداشت'), { target: { value: '50000000' } });

    const otpButton = screen.getByRole('button', { name: 'تأیید و ارسال کد امنیتی پیامکی (OTP)' });
    expect(otpButton).toBeEnabled();
    expect(screen.getByText(/ارسال پیامک موقتاً غیرفعال است/)).toBeInTheDocument();

    await user.click(otpButton);

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(screen.getByText(/نیازی به وارد کردن کد نیست/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'تأیید نهایی برداشت' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(await screen.findByText('درخواست برداشت ثبت شد')).toBeInTheDocument();
    expect(onRequested).toHaveBeenCalled();
    expect(requestWithdrawal).toHaveBeenCalledWith({
      amount: '500000000',
      bankAccountId: 'ba-1',
    });
  });

  it('surfaces the API error message when the request fails', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    requestWithdrawal.mockRejectedValue(new Error('موجودی کافی نیست.'));
    render(<WithdrawRequestButton availableRial={AVAILABLE_RIAL} />);
    await user.click(screen.getByRole('button', { name: 'درخواست برداشت وجه' }));
    await screen.findByRole('radio', { name: /بانک سامان/ });

    fireEvent.change(screen.getByLabelText('مبلغ برداشت'), { target: { value: '50000000' } });

    await user.click(screen.getByRole('button', { name: 'تأیید و ارسال کد امنیتی پیامکی (OTP)' }));
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    await user.click(screen.getByRole('button', { name: 'تأیید نهایی برداشت' }));

    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('موجودی کافی نیست.');
  });
});
