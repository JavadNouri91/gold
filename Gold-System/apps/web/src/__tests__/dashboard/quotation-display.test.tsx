import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuotationModal } from '@/components/dashboard/quotation-modal';
import { formatWholeMoney, toPersianDigits } from '@/lib/utils';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('@/lib/internal-api', () => ({
  internalOrdersApi: { quotations: jest.fn(), getById: jest.fn(), approve: jest.fn() },
  internalTradesApi: { confirm: jest.fn() },
  internalQuotationsApi: {
    getById: jest.fn(),
    download: jest.fn(),
  },
}));

jest.mock('@/lib/download', () => ({
  saveBlob: jest.fn(),
}));

const api = jest.requireMock('@/lib/internal-api') as {
  internalQuotationsApi: { getById: jest.Mock; download: jest.Mock };
  internalOrdersApi: { getById: jest.Mock; approve: jest.Mock };
};
const downloadLib = jest.requireMock('@/lib/download') as { saveBlob: jest.Mock };

const quoteFixture = {
  id: 'q1',
  quotationNumber: 'QT-44',
  orderId: 'ord-1',
  customerId: 'c1',
  pricingCalculationId: 'calc-1',
  version: 2,
  status: 'ACTIVE',
  totalAmountRial: '2500000.50',
  weightGrams: '10.000000',
  purityRatio: '0.750000',
  step1BasePrice: '100.000000',
  wageAmount: '10.00',
  feeAmountRial: '0.00',
  discountAmount: '0.00',
  roundingAmount: '0.50',
  isComplete: false,
  documentAvailable: false,
  generatedAt: '2026-02-01T00:00:00.000Z',
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  items: [],
};

describe('quotation display', () => {
  it('shows the locked snapshot in a modal and does not offer a download when the document is absent', async () => {
    signIn(['quotation.read']);
    api.internalQuotationsApi.getById.mockResolvedValue(quoteFixture);
    api.internalOrdersApi.getById.mockResolvedValue({ id: 'ord-1', status: 'QUOTED' });
    render(<QuotationModal quotationId="q1" open onClose={() => undefined} />);
    expect(await screen.findByRole('dialog', { name: 'پیش‌فاکتور طلا' })).toBeInTheDocument();
    expect(screen.getByText(toPersianDigits('QT-44'))).toBeInTheDocument();
    expect(screen.getByText(/مقادیر تاریخی دوباره محاسبه نمی‌شوند/)).toBeInTheDocument();
    expect(screen.getByText('قیمت کل')).toBeInTheDocument();
    expect((await screen.findAllByText(formatWholeMoney(quoteFixture.totalAmountRial))).length).toBeGreaterThan(0);
    expect(screen.getByText('وزن')).toBeInTheDocument();
    expect(screen.getByText(/مبلغ فاکتور/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'چاپ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'دریافت سند' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تأیید نهایی' })).not.toBeInTheDocument();
  });

  it('lets a reviewer confirm the quoted order from the pre-invoice', async () => {
    signIn(['quotation.read', 'trade.approve']);
    api.internalQuotationsApi.getById.mockResolvedValue(quoteFixture);
    api.internalOrdersApi.getById.mockResolvedValue({ id: 'ord-1', status: 'QUOTED' });
    api.internalOrdersApi.approve.mockResolvedValue({ id: 'ord-1', status: 'APPROVED' });
    const user = userEvent.setup();
    render(<QuotationModal quotationId="q1" open onClose={() => undefined} />);
    await user.click(await screen.findByRole('button', { name: 'تأیید نهایی' }));
    expect(
      screen.getByText('با تأیید نهایی، معامله ساخته می‌شود و اعتبار رزروشده مصرف می‌گردد.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تأیید' }));
    expect(api.internalOrdersApi.approve).toHaveBeenCalledWith('ord-1');
  });

  it('downloads the document as a blob via the authenticated API and saves it', async () => {
    signIn(['quotation.read']);
    api.internalQuotationsApi.getById.mockResolvedValue({
      ...quoteFixture,
      documentAvailable: true,
    });
    api.internalOrdersApi.getById.mockResolvedValue({ id: 'ord-1', status: 'QUOTED' });
    api.internalQuotationsApi.download.mockResolvedValue(
      new Blob(['{"ok":true}'], { type: 'application/json' }),
    );
    const user = userEvent.setup();
    render(<QuotationModal quotationId="q-download" open onClose={() => undefined} />);

    await user.click(await screen.findByRole('button', { name: 'دریافت سند' }));

    expect(api.internalQuotationsApi.download).toHaveBeenCalledWith('q1');
    expect(downloadLib.saveBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'QT-44-v2.json',
    );
  });

  it('offers a close control at the top and at the bottom of the sheet', async () => {
    signIn(['quotation.read']);
    api.internalQuotationsApi.getById.mockResolvedValue(quoteFixture);
    api.internalOrdersApi.getById.mockResolvedValue({ id: 'ord-1', status: 'QUOTED' });
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(<QuotationModal quotationId="q1" open onClose={onClose} />);

    await user.click(await screen.findByRole('button', { name: 'بستن پیش‌فاکتور' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'بستن' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps a close control when the quotation cannot be loaded', async () => {
    signIn(['quotation.read']);
    api.internalQuotationsApi.getById.mockRejectedValue(new Error('not found'));
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(<QuotationModal quotationId="missing" open onClose={onClose} />);

    await user.click(await screen.findByRole('button', { name: 'بستن پیش‌فاکتور' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'بستن' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
