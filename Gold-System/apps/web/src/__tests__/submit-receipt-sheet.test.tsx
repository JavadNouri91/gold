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

describe('SubmitReceiptButton deposit modal', () => {
  it('opens the cash deposit modal with bank tab', () => {
    render(<SubmitReceiptButton onSubmitted={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'افزایش اعتبار' }));

    expect(screen.getByRole('heading', { name: 'افزایش اعتبار کیف پول' })).toBeInTheDocument();
    expect(screen.getByText('فیش بانکی (پایا / ساتنا / حواله)')).toBeInTheDocument();
    expect(screen.getByText(/شماره شبا/)).toBeInTheDocument();
  });

  it('renders the transfer-method heading and choices as Persian text, not Unicode escape sequences', () => {
    render(<SubmitReceiptButton onSubmitted={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /افزایش اعتبار/ }));

    const dialog = screen.getByRole('dialog');
    expect(screen.getByRole('heading', { name: '\u0631\u0648\u0634 \u0627\u0646\u062a\u0642\u0627\u0644 \u0648\u062c\u0647 *' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '\u06a9\u0627\u0631\u062a \u0628\u0647 \u06a9\u0627\u0631\u062a' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '\u062d\u0633\u0627\u0628 \u0628\u0647 \u062d\u0633\u0627\u0628' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '\u067e\u0627\u06cc\u0627' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '\u0633\u0627\u062a\u0646\u0627' })).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/\\u[0-9a-f]{4}/i);
  });

  it('accepts a receipt dropped onto the file area', async () => {
    render(<SubmitReceiptButton onSubmitted={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'افزایش اعتبار' }));

    const zone = screen.getByLabelText('فایل رسید').closest('label');
    expect(zone).toBeTruthy();
    fireEvent.drop(zone!, { dataTransfer: { files: [jpegFile()] } });

    expect(await screen.findByText('receipt.jpg')).toBeInTheDocument();
    expect(screen.getByText('با موفقیت آپلود شد')).toBeInTheDocument();
  });

  it('keeps focus on the amount field while typing and shows Persian words', () => {
    render(<SubmitReceiptButton onSubmitted={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'افزایش اعتبار' }));

    const amount = screen.getByLabelText('مبلغ');
    amount.focus();
    fireEvent.change(amount, { target: { value: '1' } });
    fireEvent.change(amount, { target: { value: '12' } });
    fireEvent.change(amount, { target: { value: '125000' } });

    expect(amount).toHaveValue('۱۲۵,۰۰۰');
    expect(amount).toHaveFocus();
    expect(screen.getByText('معادل: صد و بیست و پنج هزار تومان')).toBeInTheDocument();
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

  it('disables submit until amount, tracking number, and receipt are set', async () => {
    render(<SubmitReceiptButton onSubmitted={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'افزایش اعتبار' }));

    const submit = screen.getByRole('button', { name: 'ثبت و ارسال رسید برای بررسی' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('مبلغ'), { target: { value: '1000000' } });
    fireEvent.change(screen.getByLabelText('شماره پیگیری'), { target: { value: '849201948' } });
    expect(submit).toBeDisabled();

    fireEvent.drop(screen.getByLabelText('فایل رسید').closest('label')!, {
      dataTransfer: { files: [jpegFile()] },
    });

    expect(await screen.findByText('receipt.jpg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت و ارسال رسید برای بررسی' })).not.toBeDisabled();
  });
});
