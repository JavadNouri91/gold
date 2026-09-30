'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/lib/auth';
import { ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { formatMobile } from '@/lib/utils';

interface OtpForm {
  code: string;
}

export default function OtpPage() {
  const { verifyOtp, closeOtherSessions } = useAuth();
  const router = useRouter();
  const [mobile, setMobile] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [closeToken, setCloseToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('login_mobile');
    if (!stored) {
      router.replace('/portal/login');
      return;
    }
    setMobile(stored);
  }, [router]);

  const { register, handleSubmit, formState: { errors } } = useForm<OtpForm>();

  const onSubmit = async (data: OtpForm) => {
    if (!mobile) return;
    setError(null);
    setCloseToken(null);
    setIsLoading(true);
    try {
      await verifyOtp(mobile, data.code.trim());
      sessionStorage.removeItem('login_mobile');
      router.replace('/portal/dashboard');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'SESSION_LIMIT_REACHED') {
        const token = (err.details as { confirmationToken?: string } | undefined)?.confirmationToken;
        if (token) setCloseToken(token);
        setError(err.message);
      } else if (err instanceof ApiClientError) {
        if (err.status === 401 || err.status === 400) {
          setError('کد تأیید اشتباه است یا منقضی شده. لطفاً دوباره تلاش کنید.');
        } else {
          setError(err.message);
        }
      } else {
        setError('خطا در ارتباط با سرور.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gold-50 to-white p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔐</div>
          <h1 className="text-2xl font-bold text-gold-800">تأیید شماره موبایل</h1>
          {mobile && (
            <p className="text-sm text-muted-foreground mt-1" dir="ltr">
              کد ارسال شده به {formatMobile(mobile)}
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
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
                  sessionStorage.removeItem('login_mobile');
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
              <Input
                label="کد تأیید"
                placeholder="کد ۶ رقمی"
                dir="ltr"
                type="text"
                inputMode="numeric"
                maxLength={6}
                error={errors.code?.message}
                {...register('code', {
                  required: 'کد تأیید الزامی است',
                  pattern: {
                    value: /^\d{4,8}$/,
                    message: 'کد تأیید باید عددی باشد',
                  },
                })}
              />
              <Button type="submit" className="w-full" isLoading={isLoading}>
                تأیید و ورود
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-sm"
                onClick={() => router.push('/portal/login')}
              >
                بازگشت و تغییر شماره
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
