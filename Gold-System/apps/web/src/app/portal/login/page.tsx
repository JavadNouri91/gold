'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ApiClientError, authApi } from '@/lib/api';
import { isValidMobile, latinMobile, toLatinDigits, toPersianDigits } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { MobileInput } from '@/components/ui/mobile-input';
import { Alert } from '@/components/ui/alert';
import { PasswordRecoveryForm } from '@/components/auth/password-recovery-form';
import { ThemeCycleButton } from '@/components/theme-toggle';

export default function LoginPage() {
  const { applySession, closeOtherSessions } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<'login' | 'register' | 'recover'>('login');
  const [method, setMethod] = useState<'password' | 'sms'>('password');
  const [mobile, setMobile] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [expires, setExpires] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [closeToken, setCloseToken] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      setCooldown((v) => Math.max(0, v - 1));
      setExpires((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  function switchTab(next: typeof tab) {
    setTab(next);
    setVerifying(false);
    setOtp('');
    setPassword('');
    setConfirmPassword('');
    setError('');
    setNotice('');
    setCloseToken(null);
  }
  async function submit(event?: FormEvent, resend = false) {
    event?.preventDefault();
    setError('');
    setNotice('');
    setCloseToken(null);
    if (!isValidMobile(mobile)) {
      setError('شماره موبایل معتبر وارد کنید.');
      return;
    }
    const normalized = latinMobile(mobile);
    setBusy(true);
    try {
      if (tab === 'login' && method === 'password') {
        applySession(await authApi.customerPassword(normalized, password));
        router.replace('/portal/dashboard');
      } else if (verifying && !resend) {
        const result =
          tab === 'register'
            ? await authApi.verifyRegistration(normalized, otp)
            : await authApi.verifyCustomerOtp(normalized, otp);
        applySession(result);
        if (tab === 'register') sessionStorage.setItem('registration_success', '1');
        setPassword('');
        setConfirmPassword('');
        router.replace('/portal/dashboard');
      } else {
        let expiresInSeconds = 120;
        let resendCooldownSeconds = 60;
        if (tab === 'register') {
          if (!firstName.trim() || !lastName.trim())
            throw new Error('نام و نام خانوادگی الزامی است.');
          if (
            password.length < 12 ||
            password.length > 128 ||
            !/\p{N}/u.test(password) ||
            !/\p{L}/u.test(password)
          )
            throw new Error('رمز عبور باید ۱۲ تا ۱۲۸ نویسه و شامل حرف و عدد باشد.');
          if (password !== confirmPassword) throw new Error('تکرار رمز عبور یکسان نیست.');
          const challenge = await authApi.register({
            firstName,
            lastName,
            mobile: normalized,
            password,
            confirmPassword,
          });
          setNotice(challenge.message);
          expiresInSeconds = challenge.expiresInSeconds;
          resendCooldownSeconds = challenge.resendCooldownSeconds;
        } else {
          const challenge = await authApi.requestCustomerOtp(normalized);
          setNotice(challenge.message);
          expiresInSeconds = challenge.expiresInSeconds;
          resendCooldownSeconds = challenge.resendCooldownSeconds;
        }
        setVerifying(true);
        setOtp('');
        setCooldown(resendCooldownSeconds);
        setExpires(expiresInSeconds);
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'PASSWORD_RECOVERY_REQUIRED') {
        setPassword('');
        setNotice(err.message);
        setTab('recover');
        return;
      }
      if (err instanceof ApiClientError && err.code === 'SESSION_LIMIT_REACHED')
        setCloseToken(
          typeof err.details?.confirmationToken === 'string' ? err.details.confirmationToken : null,
        );
      setError(
        err instanceof Error && /[\u0600-\u06ff]/.test(err.message)
          ? err.message
          : 'ارتباط با سرور برقرار نشد.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      dir="rtl"
      className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-gold-50 to-white p-4 dark:from-background dark:to-background"
    >
      <div className="absolute left-4 top-4">
        <ThemeCycleButton />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 text-5xl">🪙</div>
          <h1 className="text-2xl font-bold text-gold-800 dark:text-gold-400">سامانه طلا</h1>
          <p className="mt-1 text-sm text-muted-foreground">پورتال مشتریان</p>
        </div>
        <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex gap-2" role="tablist" aria-label="ورود یا ثبت‌نام">
            {(['login', 'register'] as const).map((value) => (
              <Button
                key={value}
                role="tab"
                aria-selected={tab === value}
                variant={tab === value ? 'default' : 'outline'}
                className="flex-1"
                disabled={busy}
                onClick={() => switchTab(value)}
              >
                {value === 'login' ? 'ورود' : 'ثبت‌نام'}
              </Button>
            ))}
          </div>
          {tab === 'recover' ? (
            <PasswordRecoveryForm
              initialMobile={mobile}
              initialNotice={notice}
              onBack={() => switchTab('login')}
            />
          ) : (
            <>
              {verifying ? (
                <div className="text-center">
                  <h2 className="text-lg font-semibold">تأیید شماره موبایل</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    در صورت فعال بودن سرویس، کد تأیید برای این شماره ارسال می‌شود.
                  </p>
                </div>
              ) : null}
              {error && <Alert variant="error">{error}</Alert>}
              {notice && <Alert variant="info">{notice}</Alert>}
              {closeToken && (
                <Button
                  className="w-full"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await closeOtherSessions(closeToken);
                      router.replace('/portal/dashboard');
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'ورود انجام نشد.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  بستن همه نشست‌های دیگر
                </Button>
              )}
              <form onSubmit={(e) => void submit(e)} className="space-y-4">
                <fieldset disabled={busy} className="space-y-4">
                  {tab === 'register' && !verifying && (
                    <>
                      <Input
                        label="نام"
                        autoComplete="given-name"
                        required
                        maxLength={100}
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                      />
                      <Input
                        label="نام خانوادگی"
                        autoComplete="family-name"
                        required
                        maxLength={100}
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                      />
                    </>
                  )}
                  <MobileInput
                    label="شماره موبایل"
                    value={mobile}
                    onValueChange={setMobile}
                    disabled={verifying}
                  />
                  {!verifying && (tab === 'register' || method === 'password') && (
                    <PasswordInput
                      label="رمز عبور"
                      required
                      maxLength={128}
                      autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  )}
                  {tab === 'register' && !verifying && (
                    <PasswordInput
                      label="تکرار رمز عبور"
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  )}
                  {verifying && (
                    <>
                      <Input
                        label="کد تأیید"
                        required
                        dir="ltr"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        maxLength={6}
                        value={toPersianDigits(otp)}
                        onChange={(e) =>
                          setOtp(toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 6))
                        }
                      />
                      <p aria-live="polite" className="text-xs text-muted-foreground">
                        {expires
                          ? `اعتبار کد: ${toPersianDigits(String(expires))} ثانیه`
                          : 'اعتبار کد پایان یافت؛ کد جدید دریافت کنید.'}
                      </p>
                    </>
                  )}
                  <Button type="submit" className="w-full" isLoading={busy}>
                    {verifying
                      ? 'تأیید و ورود'
                      : tab === 'register'
                        ? 'ثبت‌نام و دریافت کد'
                        : method === 'sms'
                          ? 'دریافت کد'
                          : 'ورود'}
                  </Button>
                </fieldset>
              </form>
              {verifying && (
                <>
                  <Button
                    variant="ghost"
                    className="w-full"
                    disabled={busy || cooldown > 0}
                    onClick={() => void submit(undefined, true)}
                  >
                    {cooldown
                      ? `ارسال مجدد پس از ${toPersianDigits(String(cooldown))} ثانیه`
                      : 'ارسال مجدد کد'}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full"
                    disabled={busy}
                    onClick={() => {
                      setVerifying(false);
                      setOtp('');
                    }}
                  >
                    ویرایش اطلاعات
                  </Button>
                </>
              )}
              {tab === 'login' && (
                <>
                  <Button
                    variant="ghost"
                    className="w-full"
                    disabled={busy}
                    onClick={() => {
                      setMethod(method === 'password' ? 'sms' : 'password');
                      setVerifying(false);
                      setOtp('');
                      setPassword('');
                      setError('');
                      setNotice('');
                    }}
                  >
                    {method === 'password' ? 'ورود با کد پیامکی' : 'ورود با رمز عبور'}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full"
                    disabled={busy}
                    onClick={() => switchTab('recover')}
                  >
                    فراموشی رمز عبور
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
