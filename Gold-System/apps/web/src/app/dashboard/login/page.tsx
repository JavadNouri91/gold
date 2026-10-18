'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/lib/auth';
import { ApiClientError } from '@/lib/api';
import { isValidMobile, latinMobile, toPersianDigits } from '@/lib/utils';
import { isStaffUser } from '@/lib/permissions';
import { firstStaffRoute } from '@/lib/nav';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { MobileInput } from '@/components/ui/mobile-input';
import { Alert } from '@/components/ui/alert';
import { PasswordRecoveryForm } from '@/components/auth/password-recovery-form';
import { ThemeCycleButton } from '@/components/theme-toggle';

interface LoginForm {
  mobile: string;
  password: string;
}

export default function StaffLoginPage() {
  const { login, confirmSession, closeOtherSessions } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [closeToken, setCloseToken] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    token: string;
    sessions: Array<{ id: string; device?: string; browser?: string; os?: string; ipAddress?: string | null }>;
  } | null>(null);
  const [mode, setMode] = useState<'login' | 'recover'>('login');
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<LoginForm>({
    defaultValues: { mobile: '', password: '' },
  });
  register('mobile', {
    required: 'شماره موبایل الزامی است',
    validate: (value) => isValidMobile(value) || 'شماره موبایل معتبر نیست',
  });

  const enterDashboard = () => {
    const raw = localStorage.getItem('gold_user');
    const permissions = raw ? (JSON.parse(raw) as { permissions?: string[] }).permissions : [];
    router.replace(isStaffUser(permissions) ? firstStaffRoute(permissions) : '/portal/dashboard');
  };

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    setCloseToken(null);
    setConfirmation(null);
    setIsLoading(true);
    try {
      const mobile = latinMobile(data.mobile);
      const result = await login(mobile, data.password);
      if (result.requiresOtp) {
        sessionStorage.setItem('staff_login_mobile', mobile);
        router.push('/dashboard/otp');
        return;
      }
      enterDashboard();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'SESSION_LIMIT_REACHED') {
        const token = (err.details as { confirmationToken?: string } | undefined)?.confirmationToken;
        if (token) setCloseToken(token);
        setError(err.message);
        return;
      }
      if (err instanceof ApiClientError && err.code === 'SESSION_LIMIT_CONFIRMATION_REQUIRED') {
        const details = err.details as
          | { confirmationToken?: string; sessions?: Array<{ id: string; device?: string; browser?: string; os?: string; ipAddress?: string | null }> }
          | undefined;
        if (details?.confirmationToken && details.sessions?.length) {
          setConfirmation({ token: details.confirmationToken, sessions: details.sessions });
          setError(err.message);
          return;
        }
      }
      setError(err instanceof ApiClientError ? err.message : 'خطا در ارتباط با سرور.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="absolute left-4 top-4">
        <ThemeCycleButton />
      </div>
      <div className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-gold-800">
          {mode === 'login' ? 'ورود کارکنان' : 'بازیابی رمز عبور'}
        </h1>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">داشبورد داخلی سامانه طلا</p>
        {mode === 'login' ? (
          <>
            {error ? <Alert variant="error">{error}</Alert> : null}
            {closeToken ? (
              <Button
                type="button"
                variant="outline"
                className="mt-4 w-full"
                isLoading={isLoading}
                onClick={async () => {
                  setIsLoading(true);
                  setError(null);
                  try {
                    await closeOtherSessions(closeToken);
                    enterDashboard();
                  } catch (err) {
                    setError(err instanceof ApiClientError ? err.message : 'بستن نشست‌ها انجام نشد.');
                  } finally {
                    setIsLoading(false);
                  }
                }}
              >
                بستن همه نشست‌های دیگر
              </Button>
            ) : null}
            {confirmation ? (
              <div className="mt-4 space-y-2">
                {confirmation.sessions.map((session) => (
                  <Button
                    key={session.id}
                    type="button"
                    variant="outline"
                    className="h-auto w-full justify-between whitespace-normal py-3"
                    isLoading={isLoading}
                    onClick={async () => {
                      setIsLoading(true);
                      setError(null);
                      try {
                        await confirmSession(confirmation.token, session.id);
                        enterDashboard();
                      } catch (err) {
                        setError(err instanceof ApiClientError ? err.message : 'تأیید ورود انجام نشد.');
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                  >
                    <span>{session.device ?? 'دستگاه'} · {session.browser ?? 'مرورگر'}</span>
                    <span dir="ltr">{session.ipAddress ? toPersianDigits(session.ipAddress) : ''}</span>
                  </Button>
                ))}
              </div>
            ) : null}
            <form className="mt-4 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              <MobileInput
                label="شماره موبایل"
                error={errors.mobile?.message}
                value={watch('mobile')}
                onValueChange={(mobile) => setValue('mobile', mobile, { shouldValidate: true })}
              />
              <PasswordInput
                label="رمز عبور"
                autoComplete="current-password"
                error={errors.password?.message}
                {...register('password', {
                  required: 'رمز عبور الزامی است',
                  minLength: { value: 8, message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' },
                })}
              />
              <div className="flex justify-start">
                <button
                  type="button"
                  className="text-sm text-gold-700 hover:underline"
                  onClick={() => {
                    setError(null);
                    setMode('recover');
                  }}
                >
                  فراموشی رمز عبور
                </button>
              </div>
              <Button className="w-full" type="submit" isLoading={isLoading}>
                ورود
              </Button>
            </form>
          </>
        ) : (
          <PasswordRecoveryForm onBack={() => setMode('login')} />
        )}
      </div>
    </div>
  );
}
