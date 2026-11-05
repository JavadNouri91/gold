import { render, screen } from '@testing-library/react';
import useSWR from 'swr';
import { HeaderKycStatus } from '@/components/portal/header-kyc-status';

jest.mock('swr');
const mockSWR = useSWR as jest.Mock;

function setState(phase?: string, hasFile = false) {
  mockSWR.mockImplementation((key: string) => ({
    data:
      key === 'customer/me'
        ? { status: 'PENDING' }
        : phase
          ? { phase, documents: hasFile ? [{ file: { id: 'file-1' } }] : [] }
          : undefined,
  }));
}

it.each([
  ['NOT_STARTED', false, 'مدارک احراز هویت را ارسال کنید', 'text-red-700'],
  ['IN_PROGRESS', true, 'مدارک شما در انتظار تأیید است', 'text-amber-800'],
  ['SUBMITTED', true, 'مدارک شما در انتظار تأیید است', 'text-amber-800'],
  ['UNDER_REVIEW', true, 'مدارک شما در انتظار تأیید است', 'text-amber-800'],
  ['REJECTED', true, 'مدارک رد شده؛ نیاز به اصلاح', 'text-red-700'],
  ['NEEDS_CORRECTION', true, 'مدارک رد شده؛ نیاز به اصلاح', 'text-red-700'],
])('shows the document state for %s', (phase, hasFile, label, color) => {
  setState(phase, hasFile);
  render(<HeaderKycStatus />);
  const link = screen.getByRole('link', { name: label });
  expect(link).toHaveTextContent(label);
  expect(link).toHaveClass(color);
  expect(link).toHaveAttribute('href', '/portal/profile#kyc');
  expect(link.querySelector('svg')).toBeInTheDocument();
});

it('waits for KYC data and updates from unsubmitted to pending to approved', () => {
  setState();
  const { rerender } = render(<HeaderKycStatus />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  setState('NOT_STARTED');
  rerender(<HeaderKycStatus />);
  expect(screen.getByRole('link')).toHaveTextContent('مدارک احراز هویت را ارسال کنید');
  setState('SUBMITTED', true);
  rerender(<HeaderKycStatus />);
  expect(screen.getByRole('link')).toHaveTextContent('مدارک شما در انتظار تأیید است');
  setState('VERIFIED', true);
  rerender(<HeaderKycStatus />);
  expect(screen.getByRole('link')).toHaveClass('w-11', 'text-emerald-700', 'sm:w-12');
  expect(screen.getByRole('link')).toHaveTextContent('');
  expect(screen.getByTestId('kyc-verified-icon')).toBeInTheDocument();
});
