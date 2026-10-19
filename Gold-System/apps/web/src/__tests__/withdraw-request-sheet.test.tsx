import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WithdrawRequestButton } from '@/components/portal/payments/withdraw-request-sheet';

jest.mock('@/components/ui/modal', () => ({
  Modal: ({ open, children, title }: { open: boolean; children: React.ReactNode; title: string }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

/** 208,431,404 toman → rial */
const AVAILABLE_RIAL = '2084314040';

describe('WithdrawRequestButton', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows available balance, daily limit, and bank accounts', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<WithdrawRequestButton availableRial={AVAILABLE_RIAL} />);

    await user.click(screen.getByRole('button', { name: 'درخواست برداشت وجه' }));

    expect(screen.getByRole('heading', { name: 'درخواست برداشت وجه' })).toBeInTheDocument();
    expect(screen.getByText('موجودی قابل برداشت کیف پول')).toBeInTheDocument();
    expect(screen.getByText(/سقف برداشت روزانه پایا/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /بانک سامان/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /بانک ملت/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت شماره شبای جدید' })).toBeInTheDocument();
  });

  it('formats amount, shows words, and blocks over-balance amounts', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<WithdrawRequestButton availableRial={AVAILABLE_RIAL} />);
    await user.click(screen.getByRole('button', { name: 'درخواست برداشت وجه' }));

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

    await user.click(screen.getByRole('button', { name: '۵۰٪' }));
    expect(screen.getByLabelText('مبلغ برداشت')).toHaveValue('۱۰۴,۲۱۵,۷۰۲');

    await user.click(screen.getByRole('button', { name: 'برداشت کل موجودی' }));
    expect(screen.getByLabelText('مبلغ برداشت')).toHaveValue('۲۰۸,۴۳۱,۴۰۴');
  });

  it('walks through OTP confirmation', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onRequested = jest.fn();
    render(<WithdrawRequestButton availableRial={AVAILABLE_RIAL} onRequested={onRequested} />);
    await user.click(screen.getByRole('button', { name: 'درخواست برداشت وجه' }));

    fireEvent.change(screen.getByLabelText('مبلغ برداشت'), { target: { value: '50000000' } });
    await user.click(screen.getByRole('button', { name: 'تأیید و ارسال کد امنیتی پیامکی (OTP)' }));

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(screen.getByLabelText('کد امنیتی پیامکی')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('کد امنیتی پیامکی'), { target: { value: '12345' } });
    await user.click(screen.getByRole('button', { name: 'تأیید نهایی برداشت' }));

    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(screen.getByText('درخواست برداشت ثبت شد')).toBeInTheDocument();
    expect(onRequested).toHaveBeenCalled();
  });
});
