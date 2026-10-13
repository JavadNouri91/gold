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
  SubmitReceiptButton: () => null,
}));

const summary: PaymentSummary = {
  totalPaid: { count: 4, amountRial: '40000000.00' },
  successful: { count: 2, amountRial: '25000000.00' },
  failed: { count: 1, amountRial: '10000000.00' },
  reversed: { count: 1, amountRial: '5000000.00' },
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
      onReceiptSubmitted={() => undefined}
      {...overrides}
    />,
  );
}

describe('MyPaymentsPage status cards', () => {
  it('filters the list when a status summary card is clicked', async () => {
    const user = userEvent.setup();
    const onStatusGroup = jest.fn();
    renderPage({ onStatusGroup });

    await user.click(screen.getByRole('button', { name: 'فیلتر پرداخت‌های موفق' }));
    expect(onStatusGroup).toHaveBeenCalledWith('successful');

    await user.click(screen.getByRole('button', { name: 'فیلتر پرداخت‌های ناموفق' }));
    expect(onStatusGroup).toHaveBeenCalledWith('failed');

    await user.click(screen.getByRole('button', { name: 'فیلتر مبالغ برگشتی' }));
    expect(onStatusGroup).toHaveBeenCalledWith('reversed');
  });

  it('clears the status filter when the active card is clicked again', async () => {
    const user = userEvent.setup();
    const onStatusGroup = jest.fn();
    renderPage({ statusGroup: 'successful', onStatusGroup });

    await user.click(screen.getByRole('button', { name: 'فیلتر پرداخت‌های موفق' }));
    expect(onStatusGroup).toHaveBeenCalledWith('');
  });
});
