import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SubmitReceiptButton } from '@/components/portal/payments/submit-receipt-sheet';

jest.mock('@/lib/api', () => ({
  ApiClientError: class ApiClientError extends Error {},
  paymentsApi: { submitReceipt: jest.fn() },
}));

function jpegFile(name = 'receipt.jpg') {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], name, { type: 'image/jpeg' });
}

describe('SubmitReceiptButton drop zone', () => {
  it('accepts a receipt dropped onto the file area', async () => {
    render(<SubmitReceiptButton onSubmitted={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'افزایش اعتبار' }));

    const zone = screen.getByLabelText('فایل رسید').closest('label');
    expect(zone).toBeTruthy();
    fireEvent.drop(zone!, { dataTransfer: { files: [jpegFile()] } });

    expect(await screen.findByText('receipt.jpg')).toBeInTheDocument();
  });

  it('keeps focus on the amount field while typing', () => {
    render(<SubmitReceiptButton onSubmitted={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'افزایش اعتبار' }));

    const amount = screen.getByLabelText('مبلغ');
    amount.focus();
    fireEvent.change(amount, { target: { value: '1' } });
    fireEvent.change(amount, { target: { value: '12' } });
    fireEvent.change(amount, { target: { value: '125000' } });

    expect(amount).toHaveValue('۱۲۵,۰۰۰');
    expect(amount).toHaveFocus();
  });

  it('keeps focus on the tracking number while typing', () => {
    render(<SubmitReceiptButton onSubmitted={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'افزایش اعتبار' }));

    const reference = screen.getByLabelText('شماره پیگیری');
    reference.focus();
    fireEvent.change(reference, { target: { value: 'A' } });
    fireEvent.change(reference, { target: { value: 'AB12' } });
    fireEvent.change(reference, { target: { value: 'AB123456' } });

    expect(reference).toHaveValue('AB۱۲۳۴۵۶');
    expect(reference).toHaveFocus();
  });

  it('rejects a dropped file that is not a receipt type', async () => {
    render(<SubmitReceiptButton onSubmitted={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'افزایش اعتبار' }));

    fireEvent.drop(screen.getByLabelText('فایل رسید').closest('label')!, {
      dataTransfer: { files: [new File(['plain'], 'note.txt', { type: 'text/plain' })] },
    });

    expect(await screen.findByText('فقط تصویر JPG، PNG، WebP یا PDF پذیرفته می‌شود.')).toBeInTheDocument();
    expect(screen.queryByText('note.txt')).not.toBeInTheDocument();
  });
});
