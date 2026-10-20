import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MyPaymentsPage } from '@/components/portal/payments/my-payments-page';
import type { PaymentSummary } from '@/lib/api';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('@/components/portal/payments/submit-receipt-sheet', () => ({
  SubmitReceiptButton: ({ label }: { label?: string }) => (
    <button type="button">{label ?? 'افزایش اعتبار'}</button>
  ),
}));

jest.mock('@/components/portal/payments/withdraw-request-sheet', () => ({
  WithdrawRequestButton: ({
    label,
    open,
    onOpenChange,
  }: {
    label?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <button type="button" aria-pressed={open} onClick={() => onOpenChange?.(true)}>
      {label ?? 'درخواست برداشت وجه'}
    </button>
  ),
}));

const summary: PaymentSummary = {
  totalPaid: { count: 4, amountRial: '40000000.00' },
  successful: { count: 2, amountRial: '25000000.00' },
  failed: { count: 1, amountRial: '10000000.00' },
  reversed: { count: 1, amountRial: '5000000.00' },
  submitted: { count: 1, amountRial: '1000000000.00' },
  hasAny: true,
};

function renderPage(overrides: Partial<React.ComponentProps<typeof MyPaymentsPage>> = {}) {
  return render(
    <MyPaymentsPage
      preset="30d"
      onPreset={() => undefined}
      customFrom=""
      customTo=""
      onCustomFrom={() => undefined}
      onCustomTo={() => undefined}
      statusGroup=""
      onStatusGroup={() => undefined}
      type=""
      onType={() => undefined}
      search=""
      onSearch={() => undefined}
      page={1}
      limit={10}
      onPage={() => undefined}
      onLimit={() => undefined}
      summary={summary}
      summaryLoading={false}
      summaryError={false}
      onRetrySummary={() => undefined}
      payments={[]}
      listLoading={false}
      listError={false}
      onRetryList={() => undefined}
      meta={{ page: 1, limit: 10, total: 0, totalPages: 0 }}
      rangeReady
      availableRial="20843140400"
      onReceiptSubmitted={() => undefined}
      {...overrides}
    />,
  );
}

describe('MyPaymentsPage cash management', () => {
  it('shows the cash management title and deposit CTA', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'مدیریت واریز و برداشت' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ افزایش اعتبار (واریز)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'درخواست برداشت وجه' })).toBeInTheDocument();
  });

  it('filters the list when a status summary card is clicked', async () => {
    const user = userEvent.setup();
    const onStatusGroup = jest.fn();
    renderPage({ onStatusGroup });

    await user.click(screen.getByRole('button', { name: 'فیلتر در انتظار تأیید حسابداری' }));
    expect(onStatusGroup).toHaveBeenCalledWith('submitted');

    await user.click(screen.getByRole('button', { name: 'فیلتر مجموع واریزهای موفق' }));
    expect(onStatusGroup).toHaveBeenCalledWith('successful');

    await user.click(screen.getByRole('button', { name: 'فیلتر تراکنش‌های ناموفق / مسترد شده' }));
    expect(onStatusGroup).toHaveBeenCalledWith('failed');
  });

  it('clears the status filter when the active card is clicked again', async () => {
    const user = userEvent.setup();
    const onStatusGroup = jest.fn();
    renderPage({ statusGroup: 'successful', onStatusGroup });

    await user.click(screen.getByRole('button', { name: 'فیلتر مجموع واریزهای موفق' }));
    expect(onStatusGroup).toHaveBeenCalledWith('');
  });

  it('lets the user select the withdrawable rial wallet card', async () => {
    const user = userEvent.setup();
    renderPage();

    const card = screen.getByRole('button', { name: 'برداشت از موجودی ریالی کیف پول' });
    expect(card).toHaveAttribute('aria-pressed', 'false');
    expect(card).toHaveTextContent('موجودی ریالی کیف پول (قابل برداشت)');

    await user.click(card);
    expect(screen.getByRole('button', { name: 'برداشت از موجودی ریالی کیف پول' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
