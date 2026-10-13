'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/lib/auth';
import { ApiClientError } from '@/lib/api';
import { isValidMobile, latinMobile, toLatinDigits, MOBILE_PLACEHOLDER } from '@/lib/utils';
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

export default function LoginPage() {
  const { login, closeOtherSessions } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [closeToken, setCloseToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'recover'>('login');

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<LoginForm>({
    defaultValues: { mobile: '', password: '' },
  });
  register('mobile', {
    required: 'شماره موبایل الزامی است',
    validate: (value) => isValidMobile(value) || `فرمت شماره موبایل صحیح نیست (مثال: ${MOBILE_PLACEHOLDER})`,
  });

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    setCloseToken(null);
    setIsLoading(true);
    try {
      const mobile = latinMobile(data.mobile);
      const result = await login(mobile, toLatinDigits(data.password));
      if (result.requiresOtp) {
        sessionStorage.setItem('login_mobile', mobile);
        router.push('/portal/otp');
        return;
      }
      router.replace('/portal/dashboard');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'SESSION_LIMIT_REACHED') {
        const token = (err.details as { confirmationToken?: string } | undefined)?.confirmationToken;
        if (token) setCloseToken(token);
        setError(err.message);
      } else if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('خطا در ارتباط با سرور. لطفاً دوباره تلاش کنید.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-gold-50 to-white p-4">
      <div className="absolute left-4 top-4">
        <ThemeCycleButton />
      </div>
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🟡</div>
          <h1 className="text-2xl font-bold text-gold-800">سامانه طلا</h1>
          <p className="text-sm text-muted-foreground mt-1">ورود به پورتال مشتریان</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          <h2 className="font-semibold text-lg">
            {mode === 'login' ? 'ورود به پورتال' : 'بازیابی رمز عبور'}
          </h2>

          {mode === 'login' ? (
            <>
              {error && <Alert variant="error">{error}</Alert>}
              {closeToken ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  isLoading={isLoading}
                  onClick={async () => {
                    setIsLoading(true);
                    setError(null);
                    try {
                      await closeOtherSessions(closeToken);
                      router.replace('/portal/dashboard');
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

              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <div className="space-y-4">
                  <MobileInput
                    label="نام کاربری"
                    hint="شماره موبایل"
                    error={errors.mobile?.message}
                    value={watch('mobile')}
                    onValueChange={(mobile) => setValue('mobile', mobile, { shouldValidate: true })}
                  />
                  <PasswordInput
                    label="رمز عبور"
                    hint="برای ورود اول، کد ملی است"
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
                  <Button type="submit" className="w-full" isLoading={isLoading}>
                    ورود
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <PasswordRecoveryForm onBack={() => setMode('login')} />
          )}
        </div>

        {mode === 'login' ? (
          <p className="text-center text-xs text-muted-foreground mt-6">
            نام کاربری شماره موبایل است. رمز ورود اول کد ملی است.
          </p>
        ) : null}
      </div>
    </div>
  );
}
