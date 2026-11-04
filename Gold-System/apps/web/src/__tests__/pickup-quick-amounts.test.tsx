import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import { NewPickupModal } from '@/components/portal/pickups/new-pickup-modal';
import { QuickAmountPills } from '@/components/portal/pickups/QuickAmountPills';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/api', () => ({
  ordersApi: {
    portfolio: jest.fn().mockResolvedValue({ weightGrams: '4.813', purityRatio: '0.75' }),
  },
  pricingApi: {
    getCurrentPrice: jest
      .fn()
      .mockResolvedValue({ normalizedValue: '10000000', validityStatus: 'VALID' }),
  },
  pickupsApi: {
    feePreview: jest
      .fn()
      .mockResolvedValue({
        mode: 'PERCENTAGE',
        rateValue: '0.5',
        amountRial: '100000',
        goldPricePerGramRial: '10000000',
        canAfford: true,
      }),
    create: jest.fn(),
  },
}));

it('offers only affordable denominations and a separate whole-gram maximum', async () => {
  const onChange = jest.fn();
  render(<QuickAmountPills availableWeightGrams={4.813} value={2} onChange={onChange} />);
  expect(screen.getAllByRole('button')).toHaveLength(3);
  expect(screen.getByRole('button', { name: '۲ گرم' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: /کل سهمیه/ }));
  expect(onChange).toHaveBeenCalledWith(4);
});

it('disables the maximum when less than one whole gram is available', () => {
  render(<QuickAmountPills availableWeightGrams={0.813} value={0} onChange={jest.fn()} />);
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.getByRole('button')).toBeDisabled();
});

it('updates estimates from pills and rejects decimals and amounts above the quota', async () => {
  const user = userEvent.setup();
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <NewPickupModal open onClose={jest.fn()} />
    </SWRConfig>,
  );
  const input = await screen.findByLabelText('وزن درخواستی (گرم)');
  expect(input).toHaveAttribute('placeholder', 'حداکثر ۴ گرم');
  await user.click(screen.getByRole('button', { name: '۲ گرم' }));
  expect(input).toHaveValue('۲');
  expect(await screen.findByText('۲٫۸۱۳ گرم')).toBeInTheDocument();
  expect(await screen.findByText('۱۰٬۰۰۰ تومان')).toBeInTheDocument();
  await user.clear(input);
  await user.type(input, '5');
  expect(screen.getByText(/نمی‌تواند بیشتر از سقف مجاز/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ثبت درخواست و رزرو موجودی' })).toBeDisabled();
  await user.clear(input);
  await user.type(input, '1.5');
  expect(input).toHaveValue('۱.۵');
  expect(screen.getByText('وزن باید عدد صحیح گرم و بیشتر از صفر باشد.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '+ افزودن یادداشت به سفارش' }));
  expect(screen.getByLabelText('یادداشت (اختیاری)')).toBeInTheDocument();
});
