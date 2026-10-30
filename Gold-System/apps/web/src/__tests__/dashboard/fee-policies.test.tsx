import { render, screen } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { FeePoliciesPage } from '@/components/dashboard/fee-policies-page';
import { signIn } from './auth-state';

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <FeePoliciesPage />
    </SWRConfig>,
  );
}

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  pricingApi: { listFeePolicies: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pricingApi } = require('@/lib/api') as {
  pricingApi: { listFeePolicies: jest.Mock };
};

describe('FeePoliciesPage pickup column', () => {
  beforeEach(() => {
    signIn(['pricing.fees.manage']);
    pricingApi.listFeePolicies.mockReset();
  });

  it('renders the BUY, SELL, and PICKUP columns for every customer type', async () => {
    pricingApi.listFeePolicies.mockResolvedValue([]);
    renderPage();

    expect(await screen.findAllByText('کارمزد خرید')).toHaveLength(4);
    expect(screen.getAllByText('کارمزد فروش')).toHaveLength(4);
    expect(screen.getAllByText('کارمزد تبدیل به فیزیکی')).toHaveLength(4);
  });

  it('shows the fixed base label for a percentage pickup policy', async () => {
    pricingApi.listFeePolicies.mockResolvedValue([
      {
        id: 'pol-1',
        customerType: null,
        side: 'PICKUP',
        code: 'PICKUP_CONVERSION_FEE',
        labelFa: 'کارمزد تبدیل به فیزیکی',
        mode: 'PERCENTAGE',
        value: '2',
        calculationBase: 'PICKUP_GOLD_VALUE',
        enabled: true,
        priority: 1,
        status: 'ACTIVE',
      },
    ]);
    renderPage();

    expect(await screen.findByText('ارزش طلا در لحظه درخواست')).toBeInTheDocument();
  });
});
