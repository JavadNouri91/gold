'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/lib/auth';
import { ApiClientError } from '@/lib/api';
import { isValidMobile, latinMobile } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileInput } from '@/components/ui/mobile-input';
import { Alert } from '@/components/ui/alert';

interface LoginForm {
  mobile: string;
  password: string;
}

export default function StaffLoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<LoginForm>({
    defaultValues: { mobile: '', password: '' },
  });
  register('mobile', {
    required: 'شماره موبایل الزامی است',
    validate: (value) => isValidMobile(value) || 'شماره موبایل معتبر نیست',
  });

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    setIsLoading(true);
    try {
      const mobile = latinMobile(data.mobile);
      await login(mobile, data.password);
      sessionStorage.setItem('staff_login_mobile', mobile);
      router.push('/dashboard/otp');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'خطا در ارتباط با سرور.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-gold-800">ورود کارکنان</h1>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">داشبورد داخلی سامانه طلا</p>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <form className="mt-4 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
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
          <Button className="w-full" type="submit" isLoading={isLoading}>
            دریافت کد تأیید
          </Button>
        </form>
      </div>
    </div>
  );
}
