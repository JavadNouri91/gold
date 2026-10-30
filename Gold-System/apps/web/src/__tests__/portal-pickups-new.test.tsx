import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import NewPickupPage from '@/app/portal/pickups/new/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return {
    ...actual,
    ordersApi: { ...actual.ordersApi, portfolio: jest.fn() },
    pickupsApi: {
      ...actual.pickupsApi,
      feePreview: jest.fn(),
      create: jest.fn(),
    },
  };
});

const { ordersApi, pickupsApi } = require('@/lib/api') as {
  ordersApi: { portfolio: jest.Mock };
  pickupsApi: { feePreview: jest.Mock; create: jest.Mock };
};

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <NewPickupPage />
    </SWRConfig>,
  );
}

describe('NewPickupPage fee preview', () => {
  beforeEach(() => {
    ordersApi.portfolio.mockReset();
    pickupsApi.feePreview.mockReset();
    pickupsApi.create.mockReset();
    ordersApi.portfolio.mockResolvedValue({
      weightGrams: '50.000000',
      reservedPickupGrams: '0.000000',
      purityRatio: '0.750000',
      averageBuyPriceRial: null,
      totalBuyValueRial: null,
      totalSellValueRial: null,
    });
  });

  it('shows the conversion fee and wallet balance once a weight is entered', async () => {
    pickupsApi.feePreview.mockResolvedValue({
      labelFa: 'کارمزد تبدیل به فیزیکی',
      mode: 'FIXED',
      rateValue: '50',
      calculationBase: null,
      baseAmountRial: '0.00',
      amountRial: '500000',
      goldPricePerGramRial: null,
      priceSnapshotId: null,
      availableRial: '1000000',
      canAfford: true,
      shortfallRial: '0.00',
    });

    const user = userEvent.setup();
    renderPage();

    const weightInput = await screen.findByLabelText('وزن (گرم)');
    await user.type(weightInput, '10');

    expect(await screen.findByText('موجودی ریالی کیف پول')).toBeInTheDocument();
    expect(screen.getByText(/مبلغ ثابت/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت درخواست و رزرو موجودی' })).toBeEnabled();
  });

  it('blocks submission and shows the shortfall when the wallet cannot cover the fee', async () => {
    pickupsApi.feePreview.mockResolvedValue({
      labelFa: 'کارمزد تبدیل به فیزیکی',
      mode: 'PERCENTAGE',
      rateValue: '2',
      calculationBase: 'PICKUP_GOLD_VALUE',
      baseAmountRial: '50000000.00',
      amountRial: '1000000.00',
      goldPricePerGramRial: '5000000.00',
      priceSnapshotId: 'snap-1',
      availableRial: '200000.00',
      canAfford: false,
      shortfallRial: '800000.00',
    });

    const user = userEvent.setup();
    renderPage();

    const weightInput = await screen.findByLabelText('وزن (گرم)');
    await user.type(weightInput, '10');

    expect(
      await screen.findByText(/موجودی ریالی کیف پول برای پرداخت کارمزد تبدیل کافی نیست/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت درخواست و رزرو موجودی' })).toBeDisabled();
  });
});
