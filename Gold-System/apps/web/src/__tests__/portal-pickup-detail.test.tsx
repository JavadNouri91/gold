import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import PortalPickupDetailPage from '@/app/portal/pickups/[id]/page';
import { ApiClientError, pickupsApi, type PhysicalGoldPickup } from '@/lib/api';
import { staffPickupsApi } from '@/lib/internal-api';
import { saveBlob } from '@/lib/download';

const refresh = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'portal-p1' }),
  useRouter: () => ({ refresh }),
}));
jest.mock('@/lib/print', () => ({ usePrintPageSize: jest.fn() }));
jest.mock('@/lib/download', () => ({ saveBlob: jest.fn() }));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  pickupsApi: {
    getById: jest.fn(),
    cancel: jest.fn(),
    downloadPreInvoice: jest.fn(),
    downloadInvoice: jest.fn(),
  },
}));
jest.mock('@/lib/internal-api', () => ({
  staffPickupsApi: { cancel: jest.fn(), downloadPreInvoice: jest.fn(), downloadInvoice: jest.fn() },
}));

const pickup: PhysicalGoldPickup = {
  id: 'portal-p1',
  pickupNumber: 'PKP-000015',
  customerId: 'c1',
  storeId: 's1',
  weightGrams: '1.000000',
  purityRatio: '0.750000',
  status: 'REQUESTED',
  customerNote: null,
  staffNote: null,
  cancelReason: null,
  scheduledPickupAt: null,
  requestedAt: '2026-11-04T15:55:00Z',
  preparingAt: null,
  readyAt: null,
  deliveredAt: null,
  cancelledAt: null,
  createdAt: '2026-11-04T15:55:00Z',
  updatedAt: '2026-11-04T15:55:00Z',
  events: [],
  customer: null,
  fee: {
    code: 'PICKUP_CONVERSION_FEE',
    labelFa: 'کارمزد تبدیل',
    mode: 'PERCENTAGE',
    rateValue: '0.5',
    calculationBase: 'GOLD_VALUE',
    baseAmountRial: '265290000',
    amountRial: '1326450',
    goldPricePerGramRial: '265290000',
    status: 'RESERVED',
    walletAvailableAfterRial: '6398982770',
    reservedAt: '2026-11-04T15:55:00Z',
    settledAt: null,
    releasedAt: null,
  },
  goldPricePerGramRial: '265290000',
  documents: { preInvoiceAvailable: true, invoiceAvailable: false },
};
const getById = pickupsApi.getById as jest.Mock;
const cancel = pickupsApi.cancel as jest.Mock;
function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <PortalPickupDetailPage />
    </SWRConfig>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  getById.mockResolvedValue(pickup);
  cancel.mockResolvedValue({ ...pickup, status: 'CANCELLED' });
  (pickupsApi.downloadPreInvoice as jest.Mock).mockResolvedValue(new Blob(['invoice']));
  (pickupsApi.downloadInvoice as jest.Mock).mockResolvedValue(new Blob(['final']));
  window.print = jest.fn();
});

it('renders the portal identity, four tracking steps and receipt in Persian Toman', async () => {
  renderPage();
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('PKP-۰۰۰۰۱۵');
  expect(screen.getByRole('link', { name: /بازگشت/ })).toHaveAttribute('href', '/portal/pickups');
  expect(screen.getByText('مدیریت تحویل')).toBeInTheDocument();
  const steps = screen.getByRole('list', { name: 'مراحل تحویل حضوری' });
  expect(within(steps).getAllByRole('listitem')).toHaveLength(4);
  expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent('ثبت‌شده');
  expect(screen.getByRole('region', { name: 'زمان‌بندی مراحل' })).toBeInTheDocument();
  expect(within(screen.getByRole('complementary')).getByText('۰٫۵٪')).toBeInTheDocument();
  for (const value of [132645, 26529000, 639898277]) {
    expect(
      within(screen.getByRole('complementary')).getByText(`${value.toLocaleString('fa-IR')} تومان`),
    ).toBeInTheDocument();
  }
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByText('۶۸۹۴')).not.toBeInTheDocument();
});

it('downloads the pre-invoice through the customer API and prints', async () => {
  const user = userEvent.setup();
  renderPage();
  await user.click(await screen.findByRole('button', { name: 'پیش‌فاکتور' }));
  await waitFor(() => expect(saveBlob).toHaveBeenCalled());
  expect(pickupsApi.downloadPreInvoice).toHaveBeenCalledWith('portal-p1');
  expect(staffPickupsApi.downloadPreInvoice).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'چاپ' }));
  expect(window.print).toHaveBeenCalledTimes(1);
});

it('requires a reason, cancels through the customer API and refreshes the pickup', async () => {
  const user = userEvent.setup();
  renderPage();
  await user.click(await screen.findByRole('button', { name: 'لغو درخواست' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('کارمزد مسدودشده آزاد می‌شود');
  const reason = within(dialog).getByRole('textbox');
  const confirm = within(dialog).getByRole('button', { name: 'تأیید و لغو درخواست' });
  expect(confirm).toBeDisabled();
  await user.type(reason, '   ');
  expect(confirm).toBeDisabled();
  await user.type(reason, 'انصراف از دریافت  ');
  getById.mockResolvedValue({
    ...pickup,
    status: 'CANCELLED',
    cancelReason: 'انصراف از دریافت',
    cancelledByKind: 'CUSTOMER',
  });
  await user.click(confirm);
  await waitFor(() => expect(cancel).toHaveBeenCalledWith('portal-p1', 'انصراف از دریافت'));
  expect(staffPickupsApi.cancel).not.toHaveBeenCalled();
  expect(await screen.findByRole('status')).toHaveTextContent('درخواست با موفقیت لغو شد');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(refresh).toHaveBeenCalled();
  expect(getById.mock.calls.length).toBeGreaterThan(1);
  expect(screen.queryByRole('button', { name: 'لغو درخواست' })).not.toBeInTheDocument();
});

it('keeps the cancellation dialog and reason when the customer API rejects', async () => {
  cancel.mockRejectedValue(new ApiClientError('CONFLICT', 'درخواست قابل لغو نیست', 409));
  const user = userEvent.setup();
  renderPage();
  await user.click(await screen.findByRole('button', { name: 'لغو درخواست' }));
  await user.type(screen.getByRole('textbox'), 'انصراف');
  await user.click(screen.getByRole('button', { name: 'تأیید و لغو درخواست' }));
  expect(await screen.findByRole('status')).toHaveTextContent('درخواست قابل لغو نیست');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('انصراف');
  expect(refresh).not.toHaveBeenCalled();
});

it.each(['PREPARING', 'READY', 'DELIVERED', 'CANCELLED'] as const)(
  'hides customer cancellation for %s',
  async (status) => {
    getById.mockResolvedValue({ ...pickup, status });
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'لغو درخواست' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  },
);

it.each(['REQUESTED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'] as const)(
  'prints only the dedicated voucher without opening a staff modal for %s',
  async (status) => {
    getById.mockResolvedValue({ ...pickup, status });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'چاپ' }));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const host = document.querySelector('body > .pickup-voucher-host');
    expect(host?.querySelector('article')).not.toBeNull();
    expect(host?.querySelector('nav, aside, header, footer, button')).toBeNull();
  },
);
