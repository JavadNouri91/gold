import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import StaffPickupDetailPage from '@/app/dashboard/pickups/[id]/page';
import { ApiClientError } from '@/lib/api';
import { signIn } from './auth-state';

/** Fresh SWR cache per render so tests never share cached data. */
function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <StaffPickupDetailPage />
    </SWRConfig>,
  );
}

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'p1' }),
}));

jest.mock('@/lib/print', () => ({
  usePrintPageSize: jest.fn(),
}));

jest.mock('@/lib/internal-api', () => ({
  staffPickupsApi: {
    getById: jest.fn(),
    downloadPreInvoice: jest.fn(),
    downloadInvoice: jest.fn(),
    markPreparing: jest.fn(),
    markReady: jest.fn(),
    deliver: jest.fn(),
    cancel: jest.fn(),
  },
}));

jest.mock('@/components/ui/date-picker-jalali', () => ({
  DatePickerJalali: ({
    label,
    value,
    onChange,
    error,
    hint,
    required,
  }: {
    label?: string;
    value?: string;
    onChange?: (v: string) => void;
    error?: string;
    hint?: string;
    required?: boolean;
  }) => (
    <div>
      <label>{label}{required ? ' *' : ''}</label>
      <input
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
      />
      {error ? <p role="alert">{error}</p> : hint ? <p>{hint}</p> : null}
    </div>
  ),
}));

const api = jest.requireMock('@/lib/internal-api') as {
  staffPickupsApi: {
    getById: jest.Mock;
    downloadPreInvoice: jest.Mock;
    downloadInvoice: jest.Mock;
    markPreparing: jest.Mock;
    markReady: jest.Mock;
    deliver: jest.Mock;
    cancel: jest.Mock;
  };
};

function makePickup(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    pickupNumber: 'PKP-000001',
    customerId: 'c1',
    storeId: 's1',
    weightGrams: '10.000000',
    purityRatio: '0.750000',
    status,
    customerNote: null,
    staffNote: null,
    cancelReason: null,
    cancelledByKind: null,
    scheduledPickupAt: null,
    requestedAt: '2026-10-27T10:00:00.000Z',
    preparingAt: null,
    readyAt: null,
    deliveredAt: null,
    cancelledAt: null,
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z',
    events: [],
    customer: {
      id: 'c1',
      customerNumber: 'CUST-1',
      firstName: 'مشتری',
      lastName: 'نمونه',
      mobile: '09121234567',
    },
    fee: {
      code: 'PICKUP_CONVERSION_FEE',
      labelFa: 'کارمزد تبدیل به فیزیکی',
      mode: 'FIXED',
      rateValue: '50',
      calculationBase: null,
      baseAmountRial: '0.00',
      amountRial: '500000.00',
      goldPricePerGramRial: null,
      status: 'RESERVED',
      walletAvailableAfterRial: '9500000.00',
      reservedAt: '2026-10-27T10:00:00.000Z',
      settledAt: null,
      releasedAt: null,
    },
    goldPricePerGramRial: null,
    documents: { preInvoiceAvailable: true, invoiceAvailable: false },
    ...overrides,
  };
}

describe('pickup detail page', () => {
  beforeEach(() => {
    signIn(['pickup.read', 'pickup.prepare', 'pickup.deliver', 'pickup.cancel']);
    api.staffPickupsApi.getById.mockResolvedValue(makePickup('REQUESTED'));
    api.staffPickupsApi.markPreparing.mockResolvedValue(makePickup('PREPARING'));
    api.staffPickupsApi.markReady.mockResolvedValue(makePickup('READY'));
    api.staffPickupsApi.deliver.mockResolvedValue(makePickup('DELIVERED'));
    api.staffPickupsApi.cancel.mockResolvedValue(makePickup('CANCELLED'));
    window.print = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the requested state with header, summary and start form', async () => {
    renderPage();

    expect(await screen.findByText('تحویل حضوری')).toBeInTheDocument();
    expect(screen.getByText('مشتری و خلاصه سفارش')).toBeInTheDocument();
    expect(screen.getByText('مراحل تحویل')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'شروع آماده‌سازی' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'لغو درخواست تحویل' })).toBeInTheDocument();
    expect(screen.getByText('درخواست ثبت شده و در انتظار شروع آماده‌سازی است.')).toBeInTheDocument();
  });

  it('blocks starting preparation without a delivery date', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'شروع آماده‌سازی' }));

    expect(await screen.findByText('تاریخ تحویل را از تقویم انتخاب کنید.')).toBeInTheDocument();
    expect(api.staffPickupsApi.markPreparing).not.toHaveBeenCalled();
  });

  it('starts preparation with a date and note, then shows success', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText('تاریخ تحویل حضوری'), '2026-11-01');
    await user.type(screen.getByLabelText('یادداشت کارمند (اختیاری)'), 'آماده شود');
    await user.click(screen.getByRole('button', { name: 'شروع آماده‌سازی' }));

    await waitFor(() =>
      expect(api.staffPickupsApi.markPreparing).toHaveBeenCalledWith('p1', {
        scheduledPickupAt: '2026-11-01',
        staffNote: 'آماده شود',
      }),
    );
    expect(await screen.findByText('آماده‌سازی شروع شد.')).toBeInTheDocument();
  });

  it('prevents duplicate preparation submissions while pending', async () => {
    const user = userEvent.setup();
    let resolvePrepare: (v: unknown) => void = () => {};
    api.staffPickupsApi.markPreparing.mockReturnValue(
      new Promise((resolve) => {
        resolvePrepare = resolve;
      }),
    );
    renderPage();

    await user.type(await screen.findByLabelText('تاریخ تحویل حضوری'), '2026-11-01');
    const button = screen.getByRole('button', { name: 'شروع آماده‌سازی' });
    await user.click(button);
    await user.click(button);

    expect(api.staffPickupsApi.markPreparing).toHaveBeenCalledTimes(1);
    resolvePrepare(makePickup('PREPARING'));
    await screen.findByText('آماده‌سازی شروع شد.');
  });

  it('shows the planned delivery date as plain text', async () => {
    api.staffPickupsApi.getById.mockResolvedValue(
      makePickup('PREPARING', {
        preparingAt: '2026-10-28T09:00:00.000Z',
        scheduledPickupAt: '2026-11-10T09:00:00.000Z',
      }),
    );
    renderPage();

    // The workflow card shows the date as plain text (no month calendar).
    expect(await screen.findByText(/^زمان تحویل برنامه‌ریزی‌شده:$/)).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('shows the status timeline inside the gold card', async () => {
    api.staffPickupsApi.getById.mockResolvedValue(
      makePickup('REQUESTED', {
        events: [
          {
            id: 'e1',
            status: 'REQUESTED',
            note: null,
            actorId: null,
            createdAt: '2026-10-28T12:13:00.000Z',
          },
        ],
      }),
    );
    renderPage();

    const timeline = await screen.findByRole('region', { name: 'زمان‌بندی' });
    expect(within(timeline).getByText('ثبت‌شده')).toBeInTheDocument();

    // Timeline lives inside the gold & order card, above the gold facts.
    const title = screen.getByText('اطلاعات طلا و سفارش');
    let card: HTMLElement | null = title.parentElement;
    while (card && !card.className.includes('rounded-xl')) card = card.parentElement;
    expect(card).not.toBeNull();
    expect(card).toContainElement(timeline);
    const weightLabel = within(card as HTMLElement).getByText('وزن طلا');
    expect(
      timeline.compareDocumentPosition(weightLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(timeline).getByText(/آبان ۱۴۰۵/)).toBeInTheDocument();
  });

  it('hides the preparation form and offers ready when preparing', async () => {
    api.staffPickupsApi.getById.mockResolvedValue(
      makePickup('PREPARING', { preparingAt: '2026-10-28T09:00:00.000Z' }),
    );
    renderPage();

    expect(await screen.findByRole('button', { name: 'اعلام آماده تحویل' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'شروع آماده‌سازی' })).not.toBeInTheDocument();
    expect(screen.getByText('شروع آماده‌سازی')).toBeInTheDocument();
    expect(screen.getAllByText('در حال آماده‌سازی').length).toBeGreaterThan(0);
  });

  it('registers delivery through a confirmation dialog', async () => {
    api.staffPickupsApi.getById.mockResolvedValue(
      makePickup('READY', { readyAt: '2026-10-28T10:00:00.000Z' }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'ثبت تحویل در فروشگاه' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/کارمزد تبدیل/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'ثبت تحویل' }));
    await waitFor(() => expect(api.staffPickupsApi.deliver).toHaveBeenCalledWith('p1', undefined));
  });

  it('hides actions and shows the invoice after delivery', async () => {
    api.staffPickupsApi.getById.mockResolvedValue(
      makePickup('DELIVERED', {
        deliveredAt: '2026-10-28T11:00:00.000Z',
        documents: { preInvoiceAvailable: true, invoiceAvailable: true },
      }),
    );
    renderPage();

    expect(await screen.findByText('تحویل انجام شد')).toBeInTheDocument();
    expect(screen.getByText('فاکتور')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'شروع آماده‌سازی' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'لغو درخواست تحویل' })).not.toBeInTheDocument();
  });

  it('offers a signable receipt for a delivered pickup', async () => {
    api.staffPickupsApi.getById.mockResolvedValue(
      makePickup('DELIVERED', {
        preparingAt: '2026-10-28T09:19:00.000Z',
        readyAt: '2026-10-28T09:21:00.000Z',
        deliveredAt: '2026-10-28T11:00:00.000Z',
        documents: { preInvoiceAvailable: true, invoiceAvailable: true },
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'نمایش' }));
    const dialog = await screen.findByRole('dialog');

    // The receipt repeats the page facts (printed once each) plus a signature area.
    expect(within(dialog).getByText('رسید تحویل حضوری طلا')).toBeInTheDocument();
    expect(within(dialog).getByText('اطلاعات طلا و سفارش')).toBeInTheDocument();
    expect(within(dialog).getByText('وضعیت مالی و رزرو')).toBeInTheDocument();
    expect(within(dialog).getByText('امضای مشتری')).toBeInTheDocument();
    // Customer identity sits in the header; the separate customer card is gone.
    expect(within(dialog).queryByText('اطلاعات مشتری')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('مشتری و خلاصه سفارش')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('اطلاعات درخواست')).not.toBeInTheDocument();
    expect(within(dialog).getByText('موبایل')).toBeInTheDocument();
    expect(within(dialog).queryAllByText('کد مشتری')).toHaveLength(1);
    // Wallet balance after reservation is screen-only and must not print.
    const walletRow = within(dialog).getByText('موجودی کیف پول پس از رزرو').closest('div');
    expect(walletRow).toHaveClass('print:hidden');
    // The four lifecycle timestamps keep the workflow order in the header.
    const meta = dialog.querySelector('.pickup-receipt-meta');
    expect(meta).not.toBeNull();
    const labels = Array.from(meta!.querySelectorAll('dt')).map((dt) => dt.textContent?.trim());
    expect(labels.slice(-4)).toEqual([
      'ثبت‌شده',
      'در حال آماده‌سازی',
      'آماده تحویل',
      'تحویل‌شده',
    ]);
    expect(window.print).not.toHaveBeenCalled();
  });

  it('prints the receipt when the print button is used', async () => {
    api.staffPickupsApi.getById.mockResolvedValue(
      makePickup('DELIVERED', { deliveredAt: '2026-10-28T11:00:00.000Z' }),
    );
    const user = userEvent.setup();
    renderPage();

    const buttons = await screen.findAllByRole('button', { name: 'چاپ' });
    await user.click(buttons[buttons.length - 1]);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(window.print).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('opens the same A5 receipt from the header print button after delivery', async () => {
    api.staffPickupsApi.getById.mockResolvedValue(
      makePickup('DELIVERED', { deliveredAt: '2026-10-28T11:00:00.000Z' }),
    );
    const user = userEvent.setup();
    renderPage();

    // The header toolbar button is the first "چاپ" on the page.
    const headerPrint = (await screen.findAllByRole('button', { name: 'چاپ' }))[0];
    await user.click(headerPrint);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('رسید تحویل حضوری طلا')).toBeInTheDocument();
    expect(within(dialog).getByText('تأیید و امضا')).toBeInTheDocument();
    // It no longer prints the whole detail page directly.
    await waitFor(() => expect(window.print).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('requires a reason of at least five characters to cancel', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'لغو درخواست تحویل' }));
    const dialog = await screen.findByRole('dialog');

    const reasonInput = within(dialog).getByLabelText(/دلیل لغو/);
    await user.type(reasonInput, 'نه');
    const confirm = within(dialog).getByRole('button', { name: 'لغو درخواست' });
    expect(confirm).toBeDisabled();

    await user.clear(reasonInput);
    await user.type(reasonInput, 'مشتری انصراف داد');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(api.staffPickupsApi.cancel).toHaveBeenCalledWith('p1', 'مشتری انصراف داد'));
  });

  it('keeps the dialog open and shows the error when cancellation fails', async () => {
    api.staffPickupsApi.cancel.mockRejectedValue(
      new ApiClientError('CANCEL_FAILED', 'لغو در این وضعیت مجاز نیست.', 409),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'لغو درخواست تحویل' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/دلیل لغو/), 'مشتری انصراف داد');
    await user.click(within(dialog).getByRole('button', { name: 'لغو درخواست' }));

    expect(await screen.findByText('لغو در این وضعیت مجاز نیست.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows no actions for a cancelled pickup', async () => {
    api.staffPickupsApi.getById.mockResolvedValue(
      makePickup('CANCELLED', {
        cancelledByKind: 'STAFF',
        cancelledAt: '2026-10-28T12:00:00.000Z',
        cancelReason: 'مشتری انصراف داد',
      }),
    );
    renderPage();

    expect(await screen.findByText('لغو درخواست')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'شروع آماده‌سازی' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'لغو درخواست تحویل' })).not.toBeInTheDocument();
  });
});
