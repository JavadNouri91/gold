'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/lib/auth';
import { ApiClientError } from '@/lib/api';
import { isStaffUser } from '@/lib/permissions';
import { firstStaffRoute } from '@/lib/nav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { formatMobile } from '@/lib/utils';

interface OtpForm {
  code: string;
}

export default function StaffOtpPage() {
  const { verifyOtp, confirmSession, closeOtherSessions } = useAuth();
  const router = useRouter();
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [closeToken, setCloseToken] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    token: string;
    sessions: Array<{ id: string; device?: string; browser?: string; os?: string; ipAddress?: string | null }>;
  } | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<OtpForm>();

  useEffect(() => {
    const stored = sessionStorage.getItem('staff_login_mobile');
    if (!stored) {
      router.replace('/dashboard/login');
      return;
    }
    setMobile(stored);
  }, [router]);

  const onSubmit = async (data: OtpForm) => {
    setError(null);
    setCloseToken(null);
    setIsLoading(true);
    try {
      await verifyOtp(mobile, data.code.trim());
      sessionStorage.removeItem('staff_login_mobile');
      const raw = localStorage.getItem('gold_user');
      const permissions = raw ? (JSON.parse(raw) as { permissions?: string[] }).permissions : [];
      if (!isStaffUser(permissions)) {
        router.replace('/portal/dashboard');
        return;
      }
      router.replace(firstStaffRoute(permissions));
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-white p-6">
        <h1 className="text-xl font-bold">تأیید ورود کارکنان</h1>
        {mobile ? <p className="mt-1 text-sm text-muted-foreground" dir="ltr">{formatMobile(mobile)}</p> : null}
        {error ? <div className="mt-4"><Alert variant="error">{error}</Alert></div> : null}
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
                sessionStorage.removeItem('staff_login_mobile');
                const raw = localStorage.getItem('gold_user');
                const permissions = raw ? (JSON.parse(raw) as { permissions?: string[] }).permissions : [];
                router.replace(isStaffUser(permissions) ? firstStaffRoute(permissions) : '/portal/dashboard');
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
                    sessionStorage.removeItem('staff_login_mobile');
                    const raw = localStorage.getItem('gold_user');
                    const permissions = raw ? (JSON.parse(raw) as { permissions?: string[] }).permissions : [];
                    router.replace(isStaffUser(permissions) ? firstStaffRoute(permissions) : '/portal/dashboard');
                  } catch (err) {
                    setError(err instanceof ApiClientError ? err.message : 'تأیید ورود انجام نشد.');
                  } finally {
                    setIsLoading(false);
                  }
                }}
              >
                <span>{session.device ?? 'دستگاه'} · {session.browser ?? 'مرورگر'}</span>
                <span dir="ltr">{session.ipAddress ?? ''}</span>
              </Button>
            ))}
          </div>
        ) : null}
        <form className="mt-4 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <Input
            label="کد تأیید"
            dir="ltr"
            maxLength={6}
            error={errors.code?.message}
            {...register('code', { required: 'کد الزامی است', minLength: { value: 4, message: 'کد ناقص است' } })}
          />
          <Button className="w-full" type="submit" isLoading={isLoading}>ورود</Button>
        </form>
      </div>
    </div>
  );
}
