'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/lib/auth';
import { ApiClientError } from '@/lib/api';
import { isValidMobile, latinMobile, MOBILE_PLACEHOLDER } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileInput } from '@/components/ui/mobile-input';
import { Alert } from '@/components/ui/alert';

interface LoginForm {
  mobile: string;
  password: string;
}

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<LoginForm>({
    defaultValues: { mobile: '', password: '' },
  });
  register('mobile', {
    required: 'شماره موبایل الزامی است',
    validate: (value) => isValidMobile(value) || `فرمت شماره موبایل صحیح نیست (مثال: ${MOBILE_PLACEHOLDER})`,
  });

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    setIsLoading(true);
    try {
      const mobile = latinMobile(data.mobile);
      await login(mobile, data.password);
      sessionStorage.setItem('login_mobile', mobile);
      router.push('/portal/otp');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('خطا در ارتباط با سرور. لطفاً دوباره تلاش کنید.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gold-50 to-white p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🟡</div>
          <h1 className="text-2xl font-bold text-gold-800">سامانه طلا</h1>
          <p className="text-sm text-muted-foreground mt-1">ورود به پورتال مشتریان</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          <h2 className="font-semibold text-lg">ورود با شماره موبایل</h2>

          {error && <Alert variant="error">{error}</Alert>}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="space-y-4">
              <MobileInput
                label="شماره موبایل"
                error={errors.mobile?.message}
                value={watch('mobile')}
                onValueChange={(mobile) => setValue('mobile', mobile, { shouldValidate: true })}
              />
              <Input
                label="رمز عبور"
                dir="ltr"
                type="password"
                autoComplete="current-password"
                error={errors.password?.message}
                {...register('password', {
                  required: 'رمز عبور الزامی است',
                  minLength: { value: 8, message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' },
                })}
              />
              <Button type="submit" className="w-full" isLoading={isLoading}>
                دریافت کد تأیید
              </Button>
            </div>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          پس از وارد کردن شماره موبایل و رمز عبور، کد تأیید برای شما ارسال می‌شود.
        </p>
      </div>
    </div>
  );
}
