import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InPersonReceiptForm } from '@/components/dashboard/in-person-receipt-form';

jest.mock('@/lib/internal-api', () => ({
  internalCustomersApi: { list: jest.fn() },
  internalPaymentsApi: { submitInPersonReceipt: jest.fn() },
}));

jest.mock('@/lib/api', () => ({
  ApiClientError: class ApiClientError extends Error {},
}));

const { internalCustomersApi, internalPaymentsApi } = jest.requireMock('@/lib/internal-api') as {
  internalCustomersApi: { list: jest.Mock };
  internalPaymentsApi: { submitInPersonReceipt: jest.Mock };
};

const customer = {
  id: 'c1',
  customerNumber: 'C-100',
  userId: null,
  firstName: 'علی',
  lastName: 'رضایی',
  fullName: 'علی رضایی',
  nationalId: '001',
  mobile: '09121111111',
  email: null,
  dateOfBirth: null,
  address: null,
  type: 'HOUSEHOLD',
};

describe('InPersonReceiptForm', () => {
  beforeEach(() => {
    internalCustomersApi.list.mockReset();
    internalPaymentsApi.submitInPersonReceipt.mockReset();
  });

  it('looks up a customer by mobile and records the paper slip', async () => {
    internalCustomersApi.list.mockResolvedValue({ items: [customer], meta: { page: 1, limit: 8, total: 1, totalPages: 1 } });
    internalPaymentsApi.submitInPersonReceipt.mockResolvedValue({ id: 'pay-1' });
    const onRecorded = jest.fn();

    render(<InPersonReceiptForm onRecorded={onRecorded} />);
    fireEvent.change(screen.getByLabelText('موبایل مشتری'), { target: { value: '09121111111' } });
    fireEvent.click(screen.getByRole('button', { name: 'یافتن مشتری' }));

    expect(await screen.findByText(/علی رضایی/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('مبلغ (تومان)'), { target: { value: '150000' } });
    fireEvent.change(screen.getByLabelText('شماره پیگیری'), { target: { value: 'TRK99' } });
    fireEvent.change(screen.getByLabelText('فایل فیش'), {
      target: { files: [new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'slip.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت فیش حضوری' }));

    await waitFor(() => {
      expect(internalPaymentsApi.submitInPersonReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'c1',
          method: 'BANK_TRANSFER',
          amount: '1500000',
          referenceNumber: 'TRK99',
        }),
      );
    });
    expect(onRecorded).toHaveBeenCalled();
  });

  it('asks for a customer before submitting', async () => {
    render(<InPersonReceiptForm onRecorded={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'ثبت فیش حضوری' }));
    expect(await screen.findByText('ابتدا مشتری را با شماره موبایل پیدا کنید.')).toBeInTheDocument();
    expect(internalPaymentsApi.submitInPersonReceipt).not.toHaveBeenCalled();
  });
});
