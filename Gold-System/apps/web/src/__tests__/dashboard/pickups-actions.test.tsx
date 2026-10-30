import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PickupsPage from '@/app/dashboard/pickups/page';
import { signIn } from './auth-state';

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
  },
}));

const api = jest.requireMock('@/lib/internal-api') as {
  staffPickupsApi: { list: jest.Mock; getById: jest.Mock };
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
});
