'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CheckCircle2, CircleHelp, Send, ShieldCheck, Unplug } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Toast } from '@/components/dashboard/customer-widgets';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MobileInput } from '@/components/ui/mobile-input';
import { ApiClientError } from '@/lib/api';
import { smsSettingsApi, type SmsSettingsView, type SmsTestResult } from '@/lib/internal-api';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';

const STATUS: Record<
  SmsSettingsView['connectionStatus'],
  { label: string; tone: 'success' | 'warning' | 'muted' | 'error' }
> = {
  connected: { label: 'اتصال برقرار است', tone: 'success' },
  disconnected: { label: 'اتصال برقرار نیست', tone: 'error' },
  untested: { label: 'اتصال بررسی نشده', tone: 'muted' },
  incomplete: { label: 'تنظیمات ناقص است', tone: 'warning' },
};

function messageOf(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'عملیات انجام نشد.';
}

function latinDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

export function SmsSettingsPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user?.permissions, 'sms.settings.manage');
  const { data, error, isLoading, mutate } = useSWR(canManage ? 'sms-settings' : null, () =>
    smsSettingsApi.get(),
  );
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [username, setUsername] = useState('CSkkrm');
  const [password, setPassword] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const [originator, setOriginator] = useState('50004597');
  const [otpTemplate, setOtpTemplate] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [expires, setExpires] = useState('120');
  const [cooldown, setCooldown] = useState('60');
  const [attempts, setAttempts] = useState('5');
  const [mobile, setMobile] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [result, setResult] = useState<SmsTestResult | null>(null);
  const [connection, setConnection] = useState<{
    success: boolean;
    status: string;
    message: string;
    credit: string | null;
    checkedAt: string;
  } | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success');

  useEffect(() => {
    if (!data) return;
    setApiBaseUrl(data.apiBaseUrl);
    setUsername(data.username);
    setOriginator(data.originator);
    setOtpTemplate(data.otpTemplate);
    setEnabled(data.enabled);
    setExpires(String(data.otpExpiresInSeconds));
    setCooldown(String(data.otpResendCooldownSeconds));
    setAttempts(String(data.otpMaxAttempts));
    setPassword('');
    setClearPassword(false);
  }, [data]);

  if (!canManage) return <ForbiddenNotice permission="sms.settings.manage" />;

  const notify = (text: string, tone: 'success' | 'error' = 'success') => {
    setToastTone(tone);
    setToast(text);
  };

  async function save() {
    setErrorText(null);
    const expiry = Number(latinDigits(expires));
    const resend = Number(latinDigits(cooldown));
    const maxAttempts = Number(latinDigits(attempts));
    if (!Number.isSafeInteger(expiry) || expiry < 30 || expiry > 900)
      return setErrorText('زمان اعتبار باید بین ۳۰ تا ۹۰۰ ثانیه باشد.');
    if (!Number.isSafeInteger(resend) || resend < 30 || resend > 3600)
      return setErrorText('زمان ارسال مجدد باید بین ۳۰ تا ۳۶۰۰ ثانیه باشد.');
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5)
      return setErrorText('تعداد تلاش ناموفق باید بین ۱ تا ۵ باشد.');
    if (originator.trim() && !/^\d{3,20}$/.test(latinDigits(originator).replace(/[\s-]/g, '')))
      return setErrorText('شماره خط ارسال‌کننده معتبر نیست.');

    setSaving(true);
    try {
      const body = {
        provider: 'hisms' as const,
        apiBaseUrl: apiBaseUrl.trim(),
        username: username.trim(),
        originator: latinDigits(originator).replace(/[\s-]/g, ''),
        otpTemplate: otpTemplate.trim(),
        enabled,
        otpExpiresInSeconds: expiry,
        otpResendCooldownSeconds: resend,
        otpMaxAttempts: maxAttempts,
        ...(clearPassword ? { password: '' } : password ? { password } : {}),
      };
      const updated = await smsSettingsApi.update(body);
      await mutate(updated, { revalidate: false });
      setPassword('');
      setClearPassword(false);
      setConnection(null);
      notify('تنظیمات سرویس پیامک ذخیره شد.');
    } catch (err) {
      notify(messageOf(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const response = await smsSettingsApi.testConnection();
      setConnection(response);
      await mutate();
      notify(response.message, response.success ? 'success' : 'error');
    } catch (err) {
      notify(messageOf(err), 'error');
    } finally {
      setTesting(false);
    }
  }

  async function sendTest() {
    const normalized = latinDigits(mobile).replace(/[\s-]/g, '');
    if (!/^09\d{9}$/.test(normalized)) {
      notify('شماره موبایل مقصد معتبر نیست.', 'error');
      return;
    }
    if (!window.confirm(`پیامک آزمایشی برای شماره ${normalized} ارسال شود؟`)) return;
    setSendingTest(true);
    setResult(null);
    try {
      const response = await smsSettingsApi.sendTest(normalized);
      setResult(response);
      notify(
        response.success
          ? 'پیامک برای ارسال پذیرفته شد.'
          : (response.error ?? 'ارسال پیامک ناموفق بود.'),
        response.success ? 'success' : 'error',
      );
    } catch (err) {
      notify(messageOf(err), 'error');
    } finally {
      setSendingTest(false);
    }
  }

  const statusKey =
    (connection?.status as SmsSettingsView['connectionStatus'] | undefined) ??
    data?.connectionStatus;
  const status = statusKey ? STATUS[statusKey] : null;
  const shownConnection =
    connection ??
    (data
      ? {
          success: data.connectionStatus === 'connected',
          status: data.connectionStatus,
          message: data.connectionTestMessage ?? STATUS[data.connectionStatus].label,
          credit: null,
          checkedAt: data.connectionTestedAt ?? '',
        }
      : null);

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="تنظیمات سرویس پیامک"
        description="پیکربندی امن HiSMS و ارسال کد تأیید کاربران."
      />
      <div className="flex justify-start">
        <Link href="/dashboard/settings/sms/events">
          <Button variant="outline">مدیریت رویدادهای پیامکی</Button>
        </Link>
      </div>
      <Toast message={toast} onClose={() => setToast(null)} tone={toastTone} />
      {error ? <Alert variant="error">{messageOf(error)}</Alert> : null}
      {isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          در حال بارگذاری تنظیمات…
        </p>
      ) : null}

      {data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-4 w-4 text-gold-600" aria-hidden />
                الف. پیکربندی ارائه‌دهنده پیامک
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Input label="ارائه‌دهنده پیامک" value="HiSMS" readOnly aria-readonly="true" />
              <Input
                label="آدرس وب‌سرویس"
                value={apiBaseUrl}
                onChange={(event) => setApiBaseUrl(event.target.value)}
                dir="ltr"
                autoComplete="url"
                placeholder="https://"
                hint="آدرس پنل نیست؛ نشانی وب‌سرویس را از ارائه‌دهنده دریافت کنید."
              />
              <Input
                label="نام کاربری"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                dir="ltr"
                autoComplete="username"
              />
              <div className="space-y-2">
                <Input
                  label="رمز عبور"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setClearPassword(false);
                  }}
                  dir="ltr"
                  autoComplete="new-password"
                  placeholder={
                    data.passwordConfigured ? 'برای حفظ رمز فعلی خالی بگذارید' : 'رمز عبور سرویس'
                  }
                  hint={
                    data.passwordConfigured
                      ? 'رمز عبور ذخیره شده است و هرگز از سرور بازگردانده نمی‌شود.'
                      : 'رمز عبور هنوز پیکربندی نشده است.'
                  }
                />
                {data.passwordConfigured ? (
                  <button
                    type="button"
                    className="text-xs text-red-600 underline"
                    onClick={() => {
                      setClearPassword((value) => !value);
                      setPassword('');
                    }}
                  >
                    {clearPassword ? 'لغو پاک‌کردن رمز' : 'پاک‌کردن رمز ذخیره‌شده'}
                  </button>
                ) : null}
              </div>
              <Input
                label="شماره خط ارسال‌کننده"
                value={originator}
                onChange={(event) => setOriginator(event.target.value)}
                dir="ltr"
                inputMode="numeric"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-gold-600" aria-hidden />
                ب. پیکربندی کد تأیید
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="کد قالب پیامک تأیید"
                  value={otpTemplate}
                  onChange={(event) => setOtpTemplate(event.target.value)}
                  dir="ltr"
                  autoComplete="off"
                  hint="در حال حاضر اختیاری است؛ ارسال OTP تا زمان ثبت کد قالب غیرفعال می‌ماند."
                />
                <label className="flex min-h-10 items-center gap-3 rounded-md border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => setEnabled(event.target.checked)}
                    className="h-4 w-4 accent-amber-600"
                  />
                  فعال‌سازی سرویس پیامک
                </label>
                <Input
                  label="اعتبار کد (ثانیه)"
                  value={expires}
                  onChange={(event) =>
                    setExpires(latinDigits(event.target.value).replace(/[^0-9]/g, ''))
                  }
                  inputMode="numeric"
                  dir="ltr"
                />
                <Input
                  label="فاصله ارسال مجدد (ثانیه)"
                  value={cooldown}
                  onChange={(event) =>
                    setCooldown(latinDigits(event.target.value).replace(/[^0-9]/g, ''))
                  }
                  inputMode="numeric"
                  dir="ltr"
                />
                <Input
                  label="حداکثر تلاش ناموفق برای هر کد"
                  value={attempts}
                  onChange={(event) =>
                    setAttempts(latinDigits(event.target.value).replace(/[^0-9]/g, ''))
                  }
                  inputMode="numeric"
                  dir="ltr"
                />
                <div className="rounded-md border px-3 py-2 text-sm">
                  <span className="block font-medium">محدودیت ارسال</span>
                  <span className="mt-1 block text-muted-foreground">
                    حداکثر ۵ پیامک برای هر شماره در هر ساعت؛ محدودیت IP نیز در سرور اعمال می‌شود.
                  </span>
                </div>
              </div>
              {errorText ? <Alert variant="error">{errorText}</Alert> : null}
              <div className="flex justify-start">
                <Button onClick={() => void save()} isLoading={saving}>
                  ذخیره تنظیمات
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleHelp className="h-4 w-4 text-gold-600" aria-hidden />
                ج. وضعیت اتصال
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-sm ${status?.tone === 'success' ? 'bg-emerald-100 text-emerald-800' : status?.tone === 'error' ? 'bg-red-100 text-red-800' : status?.tone === 'warning' ? 'bg-amber-100 text-amber-900' : 'bg-muted text-muted-foreground'}`}
                >
                  {status?.label}
                </span>
                {shownConnection?.credit ? (
                  <span className="text-sm">
                    اعتبار پنل: <b dir="ltr">{shownConnection.credit}</b>
                  </span>
                ) : null}
                {shownConnection?.checkedAt ? (
                  <span className="text-xs text-muted-foreground">
                    آخرین بررسی: {new Date(shownConnection.checkedAt).toLocaleString('fa-IR')}
                  </span>
                ) : null}
              </div>
              {shownConnection ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {shownConnection.message}
                </p>
              ) : null}
              <Button variant="outline" onClick={() => void testConnection()} isLoading={testing}>
                <CheckCircle2 className="me-2 h-4 w-4" aria-hidden />
                تست اتصال
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Unplug className="h-4 w-4 text-gold-600" aria-hidden />
                د. ارسال پیامک آزمایشی
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                این اقدام یک پیامک واقعی ارسال می‌کند و پیش از ارسال، تأیید شما را می‌گیرد.
              </p>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,24rem)_auto] sm:items-end">
                <MobileInput label="شماره موبایل مقصد" value={mobile} onValueChange={setMobile} />
                <Button variant="outline" onClick={() => void sendTest()} isLoading={sendingTest}>
                  <Send className="me-2 h-4 w-4" aria-hidden />
                  ارسال پیامک آزمایشی
                </Button>
              </div>
              {result ? (
                <Alert variant={result.success ? 'success' : 'error'}>
                  {result.success
                    ? `پذیرش ارسال توسط ارائه‌دهنده تأیید شد${result.providerReference ? `؛ شناسه: ${result.providerReference}` : ''}. تحویل پیامک هنوز تأیید نشده است.`
                    : (result.error ?? 'ارسال ناموفق بود.')}
                </Alert>
              ) : null}
              {data.passwordConfigured && !data.otpTemplate ? (
                <p className="text-xs text-amber-700">
                  قالب OTP ثبت نشده است؛ پیامک آزمایشی استاندارد همچنان مستقل از قالب قابل ارسال
                  است.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
