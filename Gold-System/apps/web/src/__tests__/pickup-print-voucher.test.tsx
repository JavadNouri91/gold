import React from 'react';
import { act, render, screen } from '@testing-library/react';
import {
  PickupPrintVoucher,
  PickupPrintVoucherSheet,
} from '@/components/portal/pickups/PickupPrintVoucher';
import type { PhysicalGoldPickup } from '@/lib/api';

const pickup: PhysicalGoldPickup = {
  id: 'p1',
  pickupNumber: 'PKP-000016',
  customerId: 'c1',
  storeId: 's1',
  weightGrams: '1',
  purityRatio: '0.75',
  status: 'REQUESTED',
  customerNote: null,
  staffNote: 'must not be printed',
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
  customer: {
    id: 'c1',
    customerNumber: 'C-1',
    firstName: 'مشتری',
    lastName: 'نمونه',
    mobile: '09121234567',
  },
  fee: {
    code: 'PICKUP_CONVERSION_FEE',
    labelFa: 'کارمزد',
    mode: 'PERCENTAGE',
    rateValue: '0.5',
    calculationBase: 'GOLD_VALUE',
    baseAmountRial: '265290000',
    amountRial: '1326450',
    goldPricePerGramRial: '265290000',
    status: 'RESERVED',
    walletAvailableAfterRial: '6398982770',
    reservedAt: null,
    settledAt: null,
    releasedAt: null,
  },
  goldPricePerGramRial: '265290000',
  documents: { preInvoiceAvailable: true, invoiceAvailable: false },
};

it('renders an RTL voucher with customer, asset, fee, barcode and signature blocks', () => {
  render(<PickupPrintVoucherSheet pickup={pickup} issuedAt="2026-11-04T15:55:00Z" />);
  expect(screen.getByRole('article')).toHaveAttribute('dir', 'rtl');
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('رسید رسمی تحویل فیزیکی طلا');
  expect(screen.getByText('مشتری نمونه')).toBeInTheDocument();
  expect(screen.getByText('۰۹۱۲۱۲۳۴۵۶۷')).toBeInTheDocument();
  expect(screen.getByText('۱ گرم')).toBeInTheDocument();
  expect(screen.getByText('۷۵۰ عیار')).toBeInTheDocument();
  expect(screen.getByText(`${(132645).toLocaleString('fa-IR')} تومان`)).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'بارکد PKP-000016' })).toHaveAttribute(
    'data-barcode-value',
    'PKP-000016',
  );
  expect(screen.getByText('امضا و اثر انگشت مشتری')).toBeInTheDocument();
  expect(screen.getByText('امضا و مهر متصدی باجه تحویل')).toBeInTheDocument();
  expect(screen.queryByText('must not be printed')).not.toBeInTheDocument();
  expect(screen.getAllByText('در دسترس نیست')).toHaveLength(2);
  expect(screen.queryByText('۶۸۹۴')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('mounts the hidden print sheet directly under body and removes it on navigation', () => {
  const { unmount } = render(<PickupPrintVoucher pickup={pickup} />);
  const host = document.querySelector('.pickup-voucher-host');
  expect(host?.parentElement).toBe(document.body);
  expect(host).toHaveClass('hidden', 'print:block', 'print-only-container');
  expect(host?.querySelector('time[dateTime]')).not.toBeNull();
  unmount();
  expect(document.querySelector('.pickup-voucher-host')).toBeNull();
});

it('refreshes the issuance timestamp when the browser starts printing', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-04T12:00:00Z'));
  const { unmount } = render(<PickupPrintVoucher pickup={pickup} />);
  jest.setSystemTime(new Date('2026-11-04T13:00:00Z'));
  act(() => window.dispatchEvent(new Event('beforeprint')));
  expect(document.querySelector('.voucher-reference time')).toHaveAttribute(
    'dateTime',
    '2026-11-04T13:00:00.000Z',
  );
  unmount();
  jest.useRealTimers();
});
