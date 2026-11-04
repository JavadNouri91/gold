import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PickupsPage from '@/app/dashboard/pickups/page';
import { signIn } from './auth-state';
import { SWRConfig } from 'swr';
import { ApiClientError } from '@/lib/api';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/pickups',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/internal-api', () => ({
  staffPickupsApi: {
    list: jest.fn(),
    getById: jest.fn(),
    cancel: jest.fn(),
  },
}));

const api = jest.requireMock('@/lib/internal-api') as {
  staffPickupsApi: { list: jest.Mock; getById: jest.Mock; cancel: jest.Mock };
};

const PICKUP = {
  id: 'p1',
  pickupNumber: 'PU-1',
  customerId: 'c1',
  storeId: 's1',
  weightGrams: '10.000000',
  purityRatio: '0.750000',
  status: 'READY',
  customerNote: null,
  staffNote: null,
  cancelReason: null,
  scheduledPickupAt: null,
  requestedAt: '2026-01-01T00:00:00.000Z',
  preparingAt: null,
  readyAt: null,
  deliveredAt: null,
  cancelledAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  events: [],
  customer: {
    id: 'c1',
    customerNumber: 'CUST-1',
    firstName: 'مشتری',
    lastName: 'نمونه',
    mobile: '09121234567',
  },
  fee: null,
  goldPricePerGramRial: null,
  documents: { preInvoiceAvailable: false, invoiceAvailable: false },
};

describe('pickups list actions', () => {
  function renderPage() {
    return render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <PickupsPage />
      </SWRConfig>,
    );
  }

  beforeEach(() => {
    signIn(['pickup.read']);
    api.staffPickupsApi.list.mockResolvedValue({
      data: [PICKUP],
      meta: { total: 1, limit: 20, offset: 0 },
    });
    api.staffPickupsApi.getById.mockResolvedValue(PICKUP);
    window.print = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders separate view and print buttons in the actions column', async () => {
    render(<PickupsPage />);
    expect(await screen.findByRole('button', { name: 'مشاهده درخواست PU-1' })).toHaveTextContent(
      'نمایش',
    );
    expect(screen.getByRole('button', { name: 'چاپ درخواست PU-1' })).toHaveTextContent('چاپ');
  });

  it('links the اقدام action to the pickup detail page', async () => {
    render(<PickupsPage />);
    const action = await screen.findByRole('link', { name: 'اقدام روی درخواست PU-1' });
    expect(action).toHaveTextContent('اقدام');
    expect(action).toHaveAttribute('href', '/dashboard/pickups/p1');
  });

  it('opens the dialog without printing when view is clicked', async () => {
    const user = userEvent.setup();
    render(<PickupsPage />);
    await user.click(await screen.findByRole('button', { name: 'مشاهده درخواست PU-1' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(api.staffPickupsApi.getById).toHaveBeenCalledWith('p1'));
    expect(window.print).not.toHaveBeenCalled();
  });

  it('opens the dialog and triggers printing when print is clicked', async () => {
    const user = userEvent.setup();
    render(<PickupsPage />);
    await user.click(await screen.findByRole('button', { name: 'چاپ درخواست PU-1' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(window.print).toHaveBeenCalled());
  });

  it('hides rejection without cancellation permission', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'اقدام روی درخواست PU-1' });
    expect(
      screen.queryByRole('button', { name: 'لغو یا رد درخواست تحویل PU-1' }),
    ).not.toBeInTheDocument();
  });

  it.each(['REQUESTED', 'PREPARING', 'READY'])('allows rejection for %s', async (status) => {
    signIn(['pickup.read', 'pickup.cancel']);
    api.staffPickupsApi.list.mockResolvedValue({
      data: [{ ...PICKUP, status }],
      meta: { total: 1 },
    });
    renderPage();
    expect(
      await screen.findByRole('button', { name: 'لغو یا رد درخواست تحویل PU-1' }),
    ).toBeEnabled();
  });

  it.each(['DELIVERED', 'CANCELLED'])('hides rejection for %s', async (status) => {
    signIn(['pickup.read', 'pickup.cancel']);
    api.staffPickupsApi.list.mockResolvedValue({
      data: [{ ...PICKUP, status }],
      meta: { total: 1 },
    });
    renderPage();
    await screen.findByRole('link', { name: 'اقدام روی درخواست PU-1' });
    expect(
      screen.queryByRole('button', { name: 'لغو یا رد درخواست تحویل PU-1' }),
    ).not.toBeInTheDocument();
  });

  it('validates the reason, prevents duplicate submission and refreshes the cancelled row', async () => {
    signIn(['pickup.read', 'pickup.cancel']);
    const user = userEvent.setup();
    let finish!: (value: unknown) => void;
    api.staffPickupsApi.cancel.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'لغو یا رد درخواست تحویل PU-1' }));
    const dialog = screen.getByRole('dialog', { name: 'لغو درخواست تحویل حضوری طلا' });
    expect(dialog).toHaveTextContent('PU-۱');
    expect(dialog).toHaveTextContent('مشتری نمونه');
    expect(dialog).toHaveTextContent('وزن طلا');
    const confirm = screen.getByRole('button', { name: 'تأیید و لغو درخواست' });
    const reason = screen.getByRole('textbox', { name: /دلیل لغو/ });
    expect(confirm).toBeDisabled();
    await user.type(reason, '   ');
    expect(confirm).toBeDisabled();
    await user.type(reason, 'عدم موجودی  ');
    await user.click(confirm);
    expect(api.staffPickupsApi.cancel).toHaveBeenCalledWith('p1', 'عدم موجودی');
    expect(confirm).toBeDisabled();
    expect(screen.getByRole('button', { name: 'انصراف' })).toBeDisabled();
    await user.click(confirm);
    expect(api.staffPickupsApi.cancel).toHaveBeenCalledTimes(1);
    const cancelled = { ...PICKUP, status: 'CANCELLED' };
    api.staffPickupsApi.list.mockResolvedValue({ data: [cancelled], meta: { total: 1 } });
    finish(cancelled);
    expect(
      await screen.findByText('درخواست با موفقیت لغو شد و طلا به کیف پول کاربر بازگشت'),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: 'لغو یا رد درخواست تحویل PU-1' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(api.staffPickupsApi.list.mock.calls.length).toBeGreaterThan(1));
  });

  it('keeps the dialog and reason on API error, and resets on close', async () => {
    signIn(['pickup.read', 'pickup.cancel']);
    api.staffPickupsApi.cancel.mockRejectedValue(
      new ApiClientError('CONFLICT', 'امکان لغو وجود ندارد', 409),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'لغو یا رد درخواست تحویل PU-1' }));
    await user.type(screen.getByRole('textbox'), 'عدم موجودی');
    await user.click(screen.getByRole('button', { name: 'تأیید و لغو درخواست' }));
    expect(await screen.findByRole('status')).toHaveTextContent('امکان لغو وجود ندارد');
    expect(screen.getByRole('textbox')).toHaveValue('عدم موجودی');
    await user.click(screen.getByRole('button', { name: 'انصراف' }));
    await user.click(screen.getByRole('button', { name: 'لغو یا رد درخواست تحویل PU-1' }));
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
