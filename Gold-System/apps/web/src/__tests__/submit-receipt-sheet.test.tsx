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

    const zone = screen.getByRole('button', { name: 'فایل رسید' });
    fireEvent.drop(zone, { dataTransfer: { files: [jpegFile()] } });

    expect(await screen.findByText('receipt.jpg')).toBeInTheDocument();
  });

  it('rejects a dropped file that is not a receipt type', async () => {
    render(<SubmitReceiptButton onSubmitted={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'افزایش اعتبار' }));

    fireEvent.drop(screen.getByRole('button', { name: 'فایل رسید' }), {
      dataTransfer: { files: [new File(['plain'], 'note.txt', { type: 'text/plain' })] },
    });

    expect(await screen.findByText('فقط تصویر JPG، PNG، WebP یا PDF پذیرفته می‌شود.')).toBeInTheDocument();
    expect(screen.queryByText('note.txt')).not.toBeInTheDocument();
  });
});
