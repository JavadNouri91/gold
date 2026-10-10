'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiClientError, authApi } from '@/lib/api';
import { isValidMobile, latinMobile, MOBILE_PLACEHOLDER, toLatinDigits } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { MobileInput, MobileNumber } from '@/components/ui/mobile-input';
import { Alert } from '@/components/ui/alert';

interface ResetForm {
  otp: string;
  password: string;
  confirmPassword: string;
}

function recoveryError(err: unknown): string {
  if (!(err instanceof ApiClientError)) {
    return 'خطا در ارتباط با سرور. لطفاً دوباره تلاش کنید.';
  }
  if (err.status === 429) {
    return 'تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.';
  }
  if (err.isValidation) {
    return 'اطلاعات واردشده معتبر نیست.';
  }
  return err.message;
}

export function PasswordRecoveryForm({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<'mobile' | 'reset' | 'done'>('mobile');
  const [mobile, setMobile] = useState('');
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<ResetForm>({
    defaultValues: { otp: '', password: '', confirmPassword: '' },
  });

  const sendCode = async (nextMobile: string) => {
    setError(null);
    setNotice(null);
    setIsLoading(true);
    try {
      const result = await authApi.requestPasswordReset(nextMobile);
      setMobile(nextMobile);
      setNotice(result.message);
      setStep('reset');
    } catch (err) {
      setError(recoveryError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const onRequestCode = async () => {
    if (!isValidMobile(mobile)) {
      setMobileError(`فرمت شماره موبایل صحیح نیست (مثال: ${MOBILE_PLACEHOLDER})`);
      return;
    }
    setMobileError(null);
    await sendCode(latinMobile(mobile));
  };

  const onReset = async (data: ResetForm) => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await authApi.resetPassword(
        mobile,
        toLatinDigits(data.otp).replace(/\D/g, ''),
        data.password,
      );
      setNotice(result.message);
      setStep('done');
    } catch (err) {
      setError(recoveryError(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <div className="space-y-4">
        <Alert variant="success">{notice}</Alert>
        <Button type="button" className="w-full" onClick={onBack}>
          بازگشت به ورود
        </Button>
      </div>
    );
  }

  if (step === 'reset') {
    return (
      <form className="space-y-4" onSubmit={handleSubmit(onReset)} noValidate>
        <p className="text-sm text-muted-foreground">
          کد پیامک‌شده به <MobileNumber value={mobile} /> را وارد کنید و رمز جدید بسازید.
        </p>
        {notice ? <Alert variant="info">{notice}</Alert> : null}
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Input
          label="کد تأیید"
          placeholder="کد ۶ رقمی"
          dir="ltr"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          error={errors.otp?.message}
          {...register('otp', {
            required: 'کد تأیید الزامی است',
            pattern: {
              value: /^[0-9۰-۹٠-٩]{4,8}$/,
              message: 'کد تأیید باید عددی باشد',
            },
          })}
        />
        <PasswordInput
          label="رمز عبور جدید"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password', {
            required: 'رمز عبور الزامی است',
            minLength: { value: 8, message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' },
          })}
        />
        <PasswordInput
          label="تکرار رمز عبور"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword', {
            required: 'تکرار رمز عبور الزامی است',
            validate: (value) => value === watch('password') || 'تکرار رمز عبور یکسان نیست',
          })}
        />
        <Button type="submit" className="w-full" isLoading={isLoading}>
          ذخیره رمز جدید
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full text-sm"
          disabled={isLoading}
          onClick={() => sendCode(mobile)}
        >
          ارسال دوباره کد
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full text-sm"
          onClick={() => {
            setStep('mobile');
            setError(null);
            setNotice(null);
          }}
        >
          تغییر شماره موبایل
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        شماره موبایل حساب را وارد کنید تا کد بازیابی برایتان پیامک شود.
      </p>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <MobileInput
        label="شماره موبایل"
        error={mobileError ?? undefined}
        value={mobile}
        onValueChange={(value) => {
          setMobile(value);
          if (mobileError) setMobileError(null);
        }}
      />
      <Button type="button" className="w-full" isLoading={isLoading} onClick={onRequestCode}>
        ارسال کد بازیابی
      </Button>
      <Button type="button" variant="ghost" className="w-full text-sm" onClick={onBack}>
        بازگشت به ورود
      </Button>
    </div>
  );
}
