import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from '@/app/portal/login/page';
import { PasswordRecoveryForm } from '@/components/auth/password-recovery-form';
import { ApiClientError, authApi } from '@/lib/api';

const mockApply = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ applySession: mockApply, closeOtherSessions: jest.fn() }),
}));
jest.mock('@/components/theme-toggle', () => ({ ThemeCycleButton: () => null }));
jest.mock('@/lib/api', () => ({
  ApiClientError: class extends Error {},
  authApi: {
    customerPassword: jest.fn(),
    register: jest.fn(),
    verifyRegistration: jest.fn(),
    requestCustomerOtp: jest.fn(),
    verifyCustomerOtp: jest.fn(),
    requestPasswordReset: jest.fn(),
    verifyPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
  },
}));
const api = authApi as jest.Mocked<typeof authApi>;
const session = {
  accessToken: 'access',
  expiresIn: 900,
  user: { id: 'u1', mobile: '09123456789', roles: ['customer'], permissions: [] },
};
function change(label: string, value: string) {
  const name = new RegExp(`^${label.replace(/\s*\*$/, '')}\\s*\\*?$`);
  fireEvent.change(screen.getByLabelText(name, { selector: 'input' }), { target: { value } });
}
beforeEach(() => {
  jest.resetAllMocks();
  sessionStorage.clear();
});

it('opens recovery with the existing mobile when a legacy password needs migration', async () => {
  const message = 'برای تعیین رمز امن از بازیابی رمز عبور استفاده کنید.';
  api.customerPassword.mockRejectedValue(
    Object.assign(new ApiClientError('PASSWORD_RECOVERY_REQUIRED', message, 422), {
      code: 'PASSWORD_RECOVERY_REQUIRED',
      message,
    }),
  );
  api.requestPasswordReset.mockResolvedValue({ message: 'کد بازیابی ارسال می‌شود.' });
  render(<LoginPage />);
  change('شماره موبایل', '09123456789');
  change('رمز عبور', '0012345678');
  fireEvent.click(screen.getByRole('button', { name: 'ورود' }));
  await screen.findByRole('heading', { name: 'بازیابی رمز عبور' });
  expect(screen.getByText(message)).toBeInTheDocument();
  expect(api.requestPasswordReset).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'دریافت کد بازیابی' }));
  await waitFor(() => expect(api.requestPasswordReset).toHaveBeenCalledWith('09123456789'));
});

it('preserves exact passwords and logs in through the customer endpoint', async () => {
  api.customerPassword.mockResolvedValue(session);
  render(<LoginPage />);
  change('شماره موبایل', '09123456789');
  change('رمز عبور', 'Exact ۱۲۳ password');
  fireEvent.click(screen.getByRole('button', { name: 'ورود' }));
  await waitFor(() =>
    expect(api.customerPassword).toHaveBeenCalledWith('09123456789', 'Exact ۱۲۳ password'),
  );
  expect(mockApply).toHaveBeenCalledWith(session);
  expect(mockReplace).toHaveBeenCalledWith('/portal/dashboard');
});
it('switches login methods without registering an account', async () => {
  api.requestCustomerOtp.mockResolvedValue({ message: 'در صورت امکان کد ارسال می‌شود.' });
  api.verifyCustomerOtp.mockResolvedValue(session);
  render(<LoginPage />);
  change('شماره موبایل', '09123456789');
  fireEvent.click(screen.getByRole('button', { name: 'ورود با کد پیامکی' }));
  fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }));
  await screen.findByLabelText('کد تأیید', { exact: false });
  change('کد تأیید', '123456');
  fireEvent.click(screen.getByRole('button', { name: 'تأیید و ورود' }));
  await waitFor(() => expect(api.verifyCustomerOtp).toHaveBeenCalledWith('09123456789', '123456'));
  expect(api.register).not.toHaveBeenCalled();
});
it('requires matching passwords before sending registration SMS', async () => {
  render(<LoginPage />);
  fireEvent.click(screen.getByRole('tab', { name: 'ثبت‌نام' }));
  change('نام*', 'First');
  change('نام خانوادگی', 'Last');
  change('شماره موبایل', '09123456789');
  change('رمز عبور*', 'Strong password 123');
  change('تکرار رمز عبور', 'Different 123');
  fireEvent.submit(screen.getByRole('button', { name: 'ثبت‌نام و دریافت کد' }).closest('form')!);
  await screen.findByText('تکرار رمز عبور یکسان نیست.');
  expect(api.register).not.toHaveBeenCalled();
});
it('verifies registration before applying the session and starting dashboard access', async () => {
  api.register.mockResolvedValue({ message: 'در صورت امکان کد ارسال می‌شود.' });
  api.verifyRegistration.mockResolvedValue(session);
  render(<LoginPage />);
  fireEvent.click(screen.getByRole('tab', { name: 'ثبت‌نام' }));
  change('نام*', 'First');
  change('نام خانوادگی', 'Last');
  change('شماره موبایل', '09123456789');
  change('رمز عبور*', 'Strong password 123');
  change('تکرار رمز عبور', 'Strong password 123');
  fireEvent.submit(screen.getByRole('button', { name: 'ثبت‌نام و دریافت کد' }).closest('form')!);
  await screen.findByLabelText('کد تأیید', { exact: false });
  expect(mockApply).not.toHaveBeenCalled();
  change('کد تأیید', '123456');
  fireEvent.click(screen.getByRole('button', { name: 'تأیید و ورود' }));
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith(session));
  expect(sessionStorage.getItem('registration_success')).toBe('1');
});
it('verifies the recovery OTP before displaying new password fields', async () => {
  api.requestPasswordReset.mockResolvedValue({ message: 'در صورت امکان کد ارسال می‌شود.' });
  api.verifyPasswordReset.mockResolvedValue({ resetGrant: 'grant' });
  api.resetPassword.mockResolvedValue({ message: 'رمز عبور تغییر کرد.' });
  render(<PasswordRecoveryForm onBack={jest.fn()} />);
  change('شماره موبایل', '09123456789');
  fireEvent.click(screen.getByRole('button', { name: 'دریافت کد بازیابی' }));
  await screen.findByLabelText('کد تأیید', { exact: false });
  expect(screen.queryByLabelText('رمز عبور جدید', { exact: false })).not.toBeInTheDocument();
  change('کد تأیید', '123456');
  fireEvent.click(screen.getByRole('button', { name: 'تأیید کد' }));
  await screen.findByLabelText('رمز عبور جدید', { exact: false });
  change('رمز عبور جدید', 'New password 123');
  change('تکرار رمز عبور', 'New password 123');
  fireEvent.click(screen.getByRole('button', { name: 'ذخیره رمز جدید' }));
  await waitFor(() =>
    expect(api.resetPassword).toHaveBeenCalledWith(
      '09123456789',
      'grant',
      'New password 123',
      'New password 123',
    ),
  );
});
