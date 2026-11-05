'use client';
import { FormEvent, useEffect, useState } from 'react';
import { authApi } from '@/lib/api';
import { isValidMobile, latinMobile, toLatinDigits, toPersianDigits } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { MobileInput } from '@/components/ui/mobile-input';
import { Alert } from '@/components/ui/alert';

export function PasswordRecoveryForm({
  onBack,
  initialMobile = '',
  initialNotice = '',
}: {
  onBack: () => void;
  initialMobile?: string;
  initialNotice?: string;
}) {
  const [step, setStep] = useState<'mobile' | 'verify' | 'password' | 'done'>('mobile');
  const [mobile, setMobile] = useState(initialMobile);
  const [otp, setOtp] = useState('');
  const [grant, setGrant] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [expires, setExpires] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initialNotice);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => {
      setCooldown((v) => Math.max(0, v - 1));
      setExpires((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  async function send() {
    if (!isValidMobile(mobile)) throw new Error('شماره موبایل معتبر وارد کنید.');
    setNotice((await authApi.requestPasswordReset(latinMobile(mobile))).message);
    setStep('verify');
    setCooldown(60);
    setExpires(120);
    setOtp('');
  }
  async function run(action: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(
        err instanceof Error && /[\u0600-\u06ff]/.test(err.message)
          ? err.message
          : 'ارتباط با سرور برقرار نشد.',
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (step === 'mobile') return send();
      if (step === 'verify') {
        setGrant((await authApi.verifyPasswordReset(latinMobile(mobile), otp)).resetGrant);
        setOtp('');
        setStep('password');
        return;
      }
      if (password !== confirmation) throw new Error('تکرار رمز عبور یکسان نیست.');
      setNotice(
        (await authApi.resetPassword(latinMobile(mobile), grant, password, confirmation)).message,
      );
      setGrant('');
      setPassword('');
      setConfirmation('');
      setStep('done');
    });
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="font-semibold">بازیابی رمز عبور</h2>
      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="info">{notice}</Alert>}
      <fieldset disabled={busy} className="space-y-4">
        {step === 'mobile' && (
          <MobileInput label="شماره موبایل" value={mobile} onValueChange={setMobile} />
        )}
        {step === 'verify' && (
          <Input
            label="کد تأیید"
            required
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={toPersianDigits(otp)}
            onChange={(e) => setOtp(toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 6))}
          />
        )}
        {step === 'password' && (
          <>
            <PasswordInput
              label="رمز عبور جدید"
              hint="۱۲ تا ۱۲۸ نویسه شامل حرف و عدد"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordInput
              label="تکرار رمز عبور"
              required
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </>
        )}
        {step !== 'done' && (
          <Button type="submit" className="w-full" isLoading={busy}>
            {step === 'mobile'
              ? 'دریافت کد بازیابی'
              : step === 'verify'
                ? 'تأیید کد'
                : 'ذخیره رمز جدید'}
          </Button>
        )}
      </fieldset>
      {step === 'verify' && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {expires
            ? `اعتبار کد: ${toPersianDigits(String(expires))} ثانیه`
            : 'اعتبار کد پایان یافت؛ کد جدید دریافت کنید.'}
        </p>
      )}
      {step === 'verify' && (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={busy || cooldown > 0}
          onClick={() => void run(send)}
        >
          {cooldown
            ? `ارسال مجدد پس از ${toPersianDigits(String(cooldown))} ثانیه`
            : 'ارسال مجدد کد'}
        </Button>
      )}
      <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={onBack}>
        بازگشت به ورود
      </Button>
    </form>
  );
}
