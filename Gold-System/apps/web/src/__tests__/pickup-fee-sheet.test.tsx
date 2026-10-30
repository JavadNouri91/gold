import { render, screen } from '@testing-library/react';
import { PickupFeeSheet } from '@/components/pickups/pickup-fee-sheet';
import type { PhysicalGoldPickup } from '@/lib/api';

function makePickup(
  fee: PhysicalGoldPickup['fee'],
  documents: PhysicalGoldPickup['documents'] = { preInvoiceAvailable: true, invoiceAvailable: false },
): PhysicalGoldPickup {
  return {
    id: 'pkp-1',
    pickupNumber: 'PKP-000001',
    customerId: 'cust-1',
    storeId: 'store-1',
    weightGrams: '10.000000',
    purityRatio: '0.750000',
    status: 'REQUESTED',
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
    customer: null,
    fee,
    goldPricePerGramRial: null,
    documents,
  };
}

describe('PickupFeeSheet', () => {
  it('renders the reserved fee breakdown and printable note', () => {
    render(
      <PickupFeeSheet
        pickup={makePickup({
          code: 'PICKUP_CONVERSION_FEE',
          labelFa: 'کارمزد تبدیل به فیزیکی',
          mode: 'FIXED',
          rateValue: '50',
          calculationBase: null,
          baseAmountRial: '0.00',
          amountRial: '50',
          goldPricePerGramRial: null,
          status: 'RESERVED',
          walletAvailableAfterRial: '50',
          reservedAt: '2026-10-27T10:00:00.000Z',
          settledAt: null,
          releasedAt: null,
        })}
        downloadPreInvoice={jest.fn()}
        downloadInvoice={jest.fn()}
      />,
    );

    expect(screen.getByText('کارمزد تبدیل به فیزیکی')).toBeInTheDocument();
    expect(screen.getByText('رزرو شده از کیف پول')).toBeInTheDocument();
    expect(screen.getByText('پیش‌فاکتور')).toBeInTheDocument();
    expect(screen.getByText('چاپ')).toBeInTheDocument();
    expect(
      screen.getByText('بهای طلا در معامله خرید قبلی تسویه شده؛ این سند فقط کارمزد تبدیل/تحویل است.'),
    ).toBeInTheDocument();
    // Only the pre-invoice is available before delivery.
    expect(screen.queryByText('فاکتور')).not.toBeInTheDocument();
  });

  it('shows a settled fee with the invoice download button after delivery', () => {
    render(
      <PickupFeeSheet
        pickup={makePickup({
          code: 'PICKUP_CONVERSION_FEE',
          labelFa: 'کارمزد تبدیل به فیزیکی',
          mode: 'PERCENTAGE',
          rateValue: '2',
          calculationBase: 'PICKUP_GOLD_VALUE',
          baseAmountRial: '10000000.00',
          amountRial: '200000.00',
          goldPricePerGramRial: '1000000.00',
          status: 'SETTLED',
          walletAvailableAfterRial: '200000.00',
          reservedAt: '2026-10-27T10:00:00.000Z',
          settledAt: '2026-10-28T10:00:00.000Z',
          releasedAt: null,
        }, { preInvoiceAvailable: true, invoiceAvailable: true })}
        downloadPreInvoice={jest.fn()}
        downloadInvoice={jest.fn()}
      />,
    );

    expect(screen.getByText('کسر شده از کیف پول')).toBeInTheDocument();
    expect(screen.getByText('فاکتور')).toBeInTheDocument();
    expect(screen.getByText('ارزش طلا (مبنای محاسبه)')).toBeInTheDocument();
  });

  it('shows the no-fee fallback when there is no charge', () => {
    render(
      <PickupFeeSheet
        pickup={makePickup(null)}
        downloadPreInvoice={jest.fn()}
        downloadInvoice={jest.fn()}
      />,
    );

    expect(
      screen.getByText('برای این درخواست کارمزد تبدیل تعریف نشده است.'),
    ).toBeInTheDocument();
  });
});
