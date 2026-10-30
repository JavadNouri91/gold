'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Check, Copy, Eye, EyeOff, KeyRound, MessageSquare, RefreshCw, RotateCcw, Send, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Toast } from '@/components/dashboard/customer-widgets';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MobileInput } from '@/components/ui/mobile-input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ApiClientError } from '@/lib/api';
import {
  smsSettingsApi,
  type SmsCreditResult,
  type SmsLineListResult,
  type SmsProviderName,
  type SmsTestResult,
} from '@/lib/internal-api';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const PROVIDERS: Array<{ value: SmsProviderName; label: string; hint: string }> = [
  { value: 'smsir', label: 'SMS.ir', hint: 'کلید API از پنل SMS.ir' },
  { value: 'melipayamak', label: 'ملی‌پیامک', hint: 'نام کاربری و رمز پنل' },
  { value: 'mock', label: 'آزمایشی (بدون ارسال)', hint: 'فقط برای توسعه' },
];

const API_KEY_SOURCE_LABEL: Record<string, string> = {
  database: 'ذخیره‌شده در پنل',
  environment: 'از فایل .env',
  none: 'تنظیم نشده',
};

function messageOf(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'ذخیره انجام نشد.';
}

export function SmsSettingsPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user?.permissions, 'sms.settings.manage');

  const { data, error, isLoading, mutate } = useSWR(canManage ? 'sms-settings' : null, () =>
    smsSettingsApi.get(),
  );

  const [provider, setProvider] = useState<SmsProviderName>('mock');
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [senderLine, setSenderLine] = useState('');
  const [smsirBaseUrl, setSmsirBaseUrl] = useState('');
  const [melipayamakBaseUrl, setMelipayamakBaseUrl] = useState('');
  const [melipayamakPassword, setMelipayamakPassword] = useState('');

  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMobile, setTestMobile] = useState('');
  const [testResult, setTestResult] = useState<SmsTestResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success');

  // Revealed plaintext secrets. Fetched on demand, never part of the page load.
  const [revealed, setRevealed] = useState<{ apiKey: string; melipayamakPassword: string } | null>(
    null,
  );
  const [revealing, setRevealing] = useState(false);
  const [copied, setCopied] = useState<'apiKey' | 'melipayamakPassword' | null>(null);

  // Panel credit — fetched on demand, never cached across providers.
  const [credit, setCredit] = useState<SmsCreditResult | null>(null);
  const [creditBusy, setCreditBusy] = useState(false);

  // Sender lines registered on the provider panel.
  const [linesResult, setLinesResult] = useState<SmsLineListResult | null>(null);
  const [linesBusy, setLinesBusy] = useState(false);
  // Escape hatch: type the line manually when the provider list is unavailable.
  const [manualLine, setManualLine] = useState(false);

  const notify = (message: string, tone: 'success' | 'error' = 'success') => {
    setToastTone(tone);
    setToast(message);
  };

  // Hydrate the form once the settings arrive; the API key is never prefilled.
  useEffect(() => {
    if (!data) return;
    setProvider(data.provider);
    setSenderLine(data.senderLine);
    setSmsirBaseUrl(data.smsirBaseUrl);
    setMelipayamakBaseUrl(data.melipayamakBaseUrl);
    setApiKey('');
    setMelipayamakPassword('');
    setClearApiKey(false);
  }, [data]);

  // Load the provider's line list whenever the form is pointed at SMS.ir.
  // `loadLines` is a hoisted declaration, so referencing it here is safe.
  useEffect(() => {
    if (!canManage) return;
    if (provider !== 'smsir') return;
    if (linesResult?.provider === 'smsir') return;
    void loadLines();
  }, [provider, canManage, linesResult]);

  if (!canManage) return <ForbiddenNotice permission="sms.settings.manage" />;

  async function reveal() {
    if (revealed) {
      setRevealed(null);
      return;
    }
    setRevealing(true);
    try {
      const secrets = await smsSettingsApi.reveal();
      setRevealed({
        apiKey: secrets.apiKey,
        melipayamakPassword: secrets.melipayamakPassword,
      });
    } catch (err: unknown) {
      notify(messageOf(err), 'error');
    } finally {
      setRevealing(false);
    }
  }

  async function copySecret(field: 'apiKey' | 'melipayamakPassword') {
    const value = revealed?.[field];
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      notify('کپی انجام نشد؛ مقدار را دستی انتخاب کنید.', 'error');
    }
  }

  function secretText(field: 'apiKey' | 'melipayamakPassword', masked: string) {
    if (!revealed) return masked || '—';
    return revealed[field] || '—';
  }

  async function loadCredit() {
    setCreditBusy(true);
    try {
      const result = await smsSettingsApi.credit();
      setCredit(result);
      if (!result.available) notify(result.message ?? 'اعتبار قابل خواندن نیست.', 'error');
    } catch (err: unknown) {
      notify(messageOf(err), 'error');
    } finally {
      setCreditBusy(false);
    }
  }

  async function loadLines() {
    setLinesBusy(true);
    try {
      const result = await smsSettingsApi.lines();
      setLinesResult(result);
      if (!result.available && result.message) notify(result.message, 'error');
    } catch (err: unknown) {
      notify(messageOf(err), 'error');
    } finally {
      setLinesBusy(false);
    }
  }

  async function save() {
    setFormError(null);
    if (provider === 'melipayamak') {
      const hasPassword =
        melipayamakPassword.trim() !== '' || (data?.melipayamakPasswordConfigured ?? false);
      if (!hasPassword) {
        setFormError('برای ملی‌پیامک رمز پنل الزامی است.');
        return;
      }
    }

    const body = {
      provider,
      senderLine: senderLine.trim(),
      smsirBaseUrl: smsirBaseUrl.trim(),
      melipayamakBaseUrl: melipayamakBaseUrl.trim(),
      ...(clearApiKey
        ? { apiKey: '' }
        : apiKey.trim()
          ? { apiKey: apiKey.trim() }
          : {}),
      ...(provider === 'melipayamak' && melipayamakPassword.trim()
        ? { melipayamakPassword: melipayamakPassword.trim() }
        : {}),
    };

    setSaving(true);
    try {
      const updated = await smsSettingsApi.update(body);
      await mutate(updated, { revalidate: false });
      setApiKey('');
      setMelipayamakPassword('');
      setClearApiKey(false);
      // A new key may expose a different set of lines.
      setLinesResult(null);
      setCredit(null);
      notify('تنظیمات پیامک ذخیره شد.');
    } catch (err: unknown) {
      notify(messageOf(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function resetToEnv() {
    if (!window.confirm('مقادیر ذخیره‌شده در پنل حذف و مقادیر فایل .env اعمال شود؟')) return;
    setResetting(true);
    try {
      const updated = await smsSettingsApi.reset();
      await mutate(updated, { revalidate: false });
      setLinesResult(null);
      setCredit(null);
      notify('تنظیمات به مقادیر فایل .env برگشت.');
    } catch (err: unknown) {
      notify(messageOf(err), 'error');
    } finally {
      setResetting(false);
    }
  }

  async function sendTest() {
    setTestResult(null);
    if (!/^09\d{9}$/.test(testMobile)) {
      notify('شماره موبایل معتبر نیست.', 'error');
      return;
    }
    setTesting(true);
    try {
      const result = await smsSettingsApi.sendTest(testMobile);
      setTestResult(result);
      if (result.success) notify('پیامک آزمایشی ارسال شد.');
      else notify(`ارسال انجام نشد: ${result.error ?? 'خطای نامشخص'}`, 'error');
    } catch (err: unknown) {
      notify(messageOf(err), 'error');
    } finally {
      setTesting(false);
    }
  }

  const currentProvider = PROVIDERS.find((item) => item.value === data?.provider);

  return (
    <div className="space-y-6">
      <PageHeader
        title="تنظیمات پیامک"
        description="ارائه‌دهنده، کلید API و شماره خط فرستنده. تغییرات بلافاصله اعمال می‌شود و نیازی به راه‌اندازی مجدد سرور ندارد."
      />

      <Toast message={toast} onClose={() => setToast(null)} tone={toastTone} />

      {error ? <Alert variant="error">{messageOf(error)}</Alert> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">در حال بارگذاری…</p> : null}

      {data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-gold-600" aria-hidden />
                وضعیت فعلی
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">ارائه‌دهنده</p>
                <p className="font-medium">{currentProvider?.label ?? data.provider}</p>
              </div>
              <div>
                <p className="text-muted-foreground">منبع تنظیمات</p>
                <p className="font-medium">
                  {data.storedInDatabase ? 'ذخیره‌شده در پنل' : 'فایل .env'}
                </p>
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground">کلید API</p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void reveal()}
                      disabled={revealing}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gold-700 hover:bg-gold-50 disabled:opacity-50"
                    >
                      {revealed ? (
                        <EyeOff className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {revealing ? 'در حال خواندن…' : revealed ? 'پنهان کردن' : 'نمایش'}
                    </button>
                    {revealed ? (
                      <button
                        type="button"
                        onClick={() => void copySecret('apiKey')}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gold-700 hover:bg-gold-50"
                      >
                        {copied === 'apiKey' ? (
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {copied === 'apiKey' ? 'کپی شد' : 'کپی'}
                      </button>
                    ) : null}
                  </div>
                </div>
                <p
                  className="mt-1 break-all rounded-md bg-muted px-2 py-1.5 font-mono text-xs"
                  dir="ltr"
                >
                  {secretText('apiKey', data.apiKeyMasked)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {API_KEY_SOURCE_LABEL[data.apiKeySource] ?? data.apiKeySource}
                  {revealed ? ' — نمایش کلید در گزارش ممیزی ثبت شد.' : null}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">خط فرستنده</p>
                <p className="font-medium" dir="ltr">
                  {data.senderLine || '—'}
                </p>
              </div>
              {data.provider === 'melipayamak' ? (
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-muted-foreground">رمز پنل ملی‌پیامک</p>
                    {revealed ? (
                      <button
                        type="button"
                        onClick={() => void copySecret('melipayamakPassword')}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gold-700 hover:bg-gold-50"
                      >
                        {copied === 'melipayamakPassword' ? (
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {copied === 'melipayamakPassword' ? 'کپی شد' : 'کپی'}
                      </button>
                    ) : null}
                  </div>
                  <p
                    className="mt-1 break-all rounded-md bg-muted px-2 py-1.5 font-mono text-xs"
                    dir="ltr"
                  >
                    {revealed
                      ? revealed.melipayamakPassword || '—'
                      : data.melipayamakPasswordConfigured
                        ? '••••••••'
                        : 'تنظیم نشده'}
                  </p>
                </div>
              ) : null}
              {data.updatedAt ? (
                <div>
                  <p className="text-muted-foreground">آخرین ویرایش</p>
                  <p className="font-medium" dir="ltr">
                    {new Date(data.updatedAt).toLocaleString('fa-IR')}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4 text-gold-600" aria-hidden />
                اعتبار پنل پیامک
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                تعداد پیامک باقی‌مانده در پنل ارائه‌دهنده. پیش از تمام‌شدن اعتبار، کدهای ورود ارسال
                نخواهند شد.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-baseline gap-2">
                  {credit?.available && credit.credit !== null ? (
                    <>
                      <span className="text-2xl font-bold" dir="ltr">
                        {credit.credit.toLocaleString('fa-IR')}
                      </span>
                      <span className="text-xs text-muted-foreground">پیامک</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {credit?.message ?? 'هنوز بررسی نشده است.'}
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={creditBusy}
                  onClick={() => void loadCredit()}
                >
                  {!creditBusy ? (
                    <RefreshCw className="me-2 h-3.5 w-3.5" aria-hidden />
                  ) : null}
                  بررسی اعتبار
                </Button>
              </div>
              {credit?.checkedAt ? (
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {new Date(credit.checkedAt).toLocaleString('fa-IR')}
                </p>
              ) : null}
              {credit && credit.available && credit.credit !== null && credit.credit <= 20 ? (
                <Alert variant="warning">
                  اعتبار پنل پیامک رو به اتمام است. شارژ کنید تا ارسال کد ورود متوقف نشود.
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4 text-gold-600" aria-hidden />
                پیکربندی ارسال
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <p className="text-sm font-medium">ارائه‌دهنده پیامک</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {PROVIDERS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={provider === item.value}
                      onClick={() => setProvider(item.value)}
                      className={cn(
                        'rounded-lg border p-3 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500',
                        provider === item.value
                          ? 'border-gold-500 bg-gold-50'
                          : 'border-input hover:bg-muted',
                      )}
                    >
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{item.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {provider === 'mock' ? (
                <Alert variant="warning">
                  در حالت آزمایشی هیچ پیامکی ارسال نمی‌شود و متن پیامک فقط در لاگ سرور ثبت می‌شود.
                  برای ارسال واقعی، SMS.ir یا ملی‌پیامک را انتخاب کنید.
                </Alert>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Input
                    label={provider === 'melipayamak' ? 'نام کاربری ملی‌پیامک' : 'کلید API'}
                    type="password"
                    dir="ltr"
                    autoComplete="off"
                    placeholder={data.apiKeyMasked || 'مقدار جدید را وارد کنید'}
                    value={apiKey}
                    disabled={clearApiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    hint={
                      clearApiKey
                        ? 'کلید ذخیره‌شده با ذخیره‌سازی پاک می‌شود.'
                        : 'برای حفظ مقدار فعلی، این فیلد را خالی بگذارید.'
                    }
                  />
                  {data.apiKeySource === 'database' ? (
                    <button
                      type="button"
                      className="text-xs text-red-600 underline-offset-4 hover:underline"
                      onClick={() => {
                        setClearApiKey((current) => !current);
                        setApiKey('');
                      }}
                    >
                      {clearApiKey ? 'انصراف از پاک کردن کلید' : 'پاک کردن کلید ذخیره‌شده'}
                    </button>
                  ) : null}
                </div>

                <div className="space-y-1">
                  {provider === 'smsir' && !manualLine && linesResult?.available ? (
                    <SearchableSelect
                      label="شماره خط فرستنده"
                      value={senderLine}
                      onChange={setSenderLine}
                      options={linesResult.lines.map((line) => ({ value: line, label: line }))}
                      placeholder="یک خط انتخاب کنید"
                      searchPlaceholder="جستجوی خط..."
                      emptyMessage="خطی در پنل ثبت نشده است"
                      hint="خطوط دریافتی از پنل SMS.ir"
                      loading={linesBusy}
                    />
                  ) : (
                    <Input
                      label="شماره خط فرستنده"
                      dir="ltr"
                      inputMode="numeric"
                      placeholder="مثلاً 30002108021796"
                      value={senderLine}
                      onChange={(event) => setSenderLine(event.target.value)}
                      hint={
                        linesResult?.message ??
                        'همان شماره‌ای که در پنل ارائه‌دهنده ثبت شده است.'
                      }
                    />
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {provider === 'smsir' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setLinesResult(null);
                            void loadLines();
                          }}
                          disabled={linesBusy}
                          className="inline-flex items-center gap-1 text-gold-700 hover:underline disabled:opacity-50"
                        >
                          <RefreshCw
                            className={cn('h-3 w-3', linesBusy && 'animate-spin')}
                            aria-hidden
                          />
                          {linesBusy ? 'در حال دریافت…' : 'بروزرسانی لیست خطوط'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualLine((current) => !current)}
                          className="text-muted-foreground hover:underline"
                        >
                          {manualLine ? 'انتخاب از لیست' : 'وارد کردن دستی'}
                        </button>
                      </>
                    ) : null}
                  </div>
                  {provider === 'smsir' &&
                  linesResult?.available &&
                  senderLine &&
                  !linesResult.lines.includes(senderLine) ? (
                    <Alert variant="warning">
                      خط <span dir="ltr">{senderLine}</span> در لیست خطوط این پنل نیست. ارسال پیامک
                      با این خط رد می‌شود.
                    </Alert>
                  ) : null}
                </div>

                {provider === 'melipayamak' ? (
                  <Input
                    label="رمز پنل ملی‌پیامک"
                    type="password"
                    dir="ltr"
                    autoComplete="off"
                    placeholder={
                      data.melipayamakPasswordConfigured ? 'مقدار جدید را وارد کنید' : 'رمز پنل'
                    }
                    value={melipayamakPassword}
                    onChange={(event) => setMelipayamakPassword(event.target.value)}
                    hint="برای حفظ رمز فعلی، این فیلد را خالی بگذارید."
                  />
                ) : null}

                <Input
                  label="آدرس پایه API"
                  dir="ltr"
                  value={provider === 'melipayamak' ? melipayamakBaseUrl : smsirBaseUrl}
                  onChange={(event) =>
                    provider === 'melipayamak'
                      ? setMelipayamakBaseUrl(event.target.value)
                      : setSmsirBaseUrl(event.target.value)
                  }
                  hint="در صورت نیاز به تغییر، آدرس کامل با http:// یا https:// بنویسید."
                />
              </div>

              {formError ? <Alert variant="error">{formError}</Alert> : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button isLoading={saving} onClick={() => void save()}>
                  ذخیره تنظیمات
                </Button>
                <Button
                  variant="outline"
                  isLoading={resetting}
                  onClick={() => void resetToEnv()}
                  disabled={!data.storedInDatabase}
                >
                  <RotateCcw className="me-2 h-4 w-4" aria-hidden />
                  بازگشت به مقادیر .env
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Send className="h-4 w-4 text-gold-600" aria-hidden />
                ارسال پیامک آزمایشی
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                یک پیامک واقعی با تنظیمات ذخیره‌شده ارسال می‌شود تا از صحت کلید و خط مطمئن شوید.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="sm:w-56">
                  <MobileInput
                    label="شماره موبایل گیرنده"
                    value={testMobile}
                    onValueChange={setTestMobile}
                  />
                </div>
                <Button isLoading={testing} variant="secondary" onClick={() => void sendTest()}>
                  ارسال پیامک آزمایشی
                </Button>
              </div>
              {testResult ? (
                <Alert variant={testResult.success ? 'success' : 'error'}>
                  {testResult.success
                    ? `پیامک آزمایشی از طریق ${testResult.provider} ارسال شد.`
                    : `ارسال انجام نشد (${testResult.provider}): ${testResult.error ?? 'خطای نامشخص'}`}
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
