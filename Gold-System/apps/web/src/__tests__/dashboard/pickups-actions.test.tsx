import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PickupsPage from '@/app/dashboard/pickups/page';
import { signIn } from './auth-state';
import { SWRConfig } from 'swr';
import { ApiClientError } from '@/lib/api';

const mockReplace = jest.fn();
let mockQueryString = '';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  usePathname: () => '/dashboard/pickups',
  useSearchParams: () => new URLSearchParams(mockQueryString),
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
    mockQueryString = '';
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

  it('applies search, actual status, date preset, and action-required together, then clears them', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('link', { name: 'اقدام روی درخواست PU-1' });
    await user.type(screen.getByRole('textbox', { name: 'جستجو' }), 'علي ۰۹۱۲');
    await user.selectOptions(screen.getByRole('combobox', { name: 'وضعیت' }), 'READY');
    await user.selectOptions(screen.getByRole('combobox', { name: 'بازه ثبت درخواست' }), 'last7');
    await user.click(screen.getByRole('checkbox', { name: 'فقط درخواست‌های نیازمند اقدام' }));
    expect(api.staffPickupsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: undefined, status: undefined }));
    await user.click(screen.getByRole('button', { name: 'اعمال فیلتر' }));
    await waitFor(() => expect(api.staffPickupsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({
      search: 'علي ۰۹۱۲', status: 'READY', dateRange: 'last7', actionRequired: 'true', offset: 0,
    })));
    expect(mockReplace).toHaveBeenLastCalledWith(expect.stringContaining('status=READY'), { scroll: false });
    expect(screen.getByRole('link', { name: 'اقدام روی درخواست PU-1' }).getAttribute('href')).toContain('returnTo=');
    await user.click(screen.getByRole('button', { name: 'پاک کردن فیلترها' }));
    await waitFor(() => expect(api.staffPickupsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({
      search: undefined, status: undefined, dateRange: undefined, actionRequired: undefined, from: undefined, to: undefined, offset: 0,
    })));
    expect(screen.getByRole('textbox', { name: 'جستجو' })).toHaveValue('');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(mockReplace).toHaveBeenLastCalledWith('/dashboard/pickups', { scroll: false });
  });

  it('sends complete custom dates and renders a filtered empty state', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('مشتری نمونه');
    await user.selectOptions(screen.getByRole('combobox', { name: 'بازه ثبت درخواست' }), 'custom');
    expect(screen.getByLabelText(/از تاریخ/)).toBeRequired();
    fireEvent.change(screen.getByLabelText(/از تاریخ/), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText(/تا تاریخ/), { target: { value: '2026-11-05' } });
    api.staffPickupsApi.list.mockResolvedValue({ data: [], meta: { total: 0, offset: 0, limit: 20 } });
    await user.click(screen.getByRole('button', { name: 'اعمال فیلتر' }));
    await waitFor(() => expect(api.staffPickupsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ dateRange: 'custom', from: '2026-11-01', to: '2026-11-05' })));
    expect(await screen.findByText('درخواست تحویلی با این فیلترها یافت نشد')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('restores URL filters, carries them through pagination, and resets to page one on apply', async () => {
    mockQueryString = 'search=PU&status=READY&page=2';
    api.staffPickupsApi.list.mockImplementation(async (params) => ({ data: [PICKUP], meta: { total: 60, limit: 20, offset: params.offset } }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('مشتری نمونه');
    expect(screen.getByRole('textbox', { name: 'جستجو' })).toHaveValue('PU');
    expect(api.staffPickupsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'PU', status: 'READY', offset: 20 }));
    const firstRow = within(screen.getByRole('table')).getAllByRole('row')[1];
    expect(within(firstRow).getAllByRole('cell')[0]).toHaveTextContent('۲۱');
    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    await waitFor(() => expect(api.staffPickupsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'PU', status: 'READY', offset: 40 })));
    await user.selectOptions(screen.getByRole('combobox', { name: 'وضعیت' }), 'DELIVERED');
    await user.click(screen.getByRole('button', { name: 'اعمال فیلتر' }));
    await waitFor(() => expect(api.staffPickupsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'DELIVERED', offset: 0 })));
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
    await user.type(screen.getByRole('textbox', { name: /دلیل لغو/ }), 'عدم موجودی');
    await user.click(screen.getByRole('button', { name: 'تأیید و لغو درخواست' }));
    expect(await screen.findByRole('status')).toHaveTextContent('امکان لغو وجود ندارد');
    expect(screen.getByRole('textbox', { name: /دلیل لغو/ })).toHaveValue('عدم موجودی');
    await user.click(screen.getByRole('button', { name: 'انصراف' }));
    await user.click(screen.getByRole('button', { name: 'لغو یا رد درخواست تحویل PU-1' }));
    expect(screen.getByRole('textbox', { name: /دلیل لغو/ })).toHaveValue('');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
