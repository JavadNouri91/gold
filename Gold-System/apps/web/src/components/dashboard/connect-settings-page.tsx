'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { PlugZap, ShieldCheck, Activity, KeyRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { ApiClientError, connectSettingsApi, type ConnectTestResult } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/dashboard/page-header';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';

const ERROR_MESSAGES: Record<string, string> = {
  HTTP_401: 'اعتبارنامه توسط Connect پذیرفته نشد (HTTP 401).',
  HTTP_403: 'دسترسی به فهرست محصولات رد شد (HTTP 403).',
  HTTP_429: 'محدودیت درخواست از سوی Connect فعال است (HTTP 429).',
  HTTP_5XX: 'سرویس Connect با خطای سرور پاسخ داد (HTTP 5xx).',
  TLS_ERROR: 'برقراری ارتباط امن TLS ناموفق بود.',
  CONNECTION_TIMEOUT: 'مهلت اتصال به پایان رسید.',
  INVALID_RESPONSE: 'پاسخ JSON دریافت شد اما ساختار آن معتبر نیست.',
  CREDENTIALS_NOT_CONFIGURED: 'ابتدا Access Key و Access Secret را تنظیم و ذخیره کنید.',
  AUTHENTICATION_FAILED: 'اعتبارنامه Connect پذیرفته نشد.',
  ACCESS_FORBIDDEN: 'دسترسی این اعتبارنامه به فهرست محصولات مجاز نیست.',
  RATE_LIMITED: 'تعداد درخواست‌ها از حد مجاز گذشته است. کمی بعد دوباره تلاش کنید.',
  TIMEOUT: 'مهلت اتصال به پایان رسید.',
  DNS_FAILURE: 'نشانی سرویس پیدا نشد.',
  INVALID_JSON: 'پاسخ سرویس قالب JSON معتبر ندارد.',
  INVALID_RESPONSE_FORMAT: 'ساختار پاسخ سرویس با قرارداد مورد انتظار سازگار نیست.',
  INVALID_PRODUCT: 'یکی از محصولات پاسخ، شناسه، عنوان، قیمت یا وضعیت معتبر ندارد.',
  INVALID_PRODUCTS_RESPONSE: 'ساختار پاسخ فهرست محصولات با قرارداد مورد انتظار سازگار نیست.',
  INVALID_PRODUCT_ID: 'شناسه یکی از محصولات معتبر نیست.',
  INVALID_PRODUCT_TITLE: 'عنوان یکی از محصولات معتبر نیست.',
  INVALID_BUY_PRICE: 'قیمت خرید یکی از محصولات معتبر نیست.',
  INVALID_SELL_PRICE: 'قیمت فروش یکی از محصولات معتبر نیست.',
  INVALID_PRODUCT_STATUS: 'وضعیت یکی از محصولات معتبر نیست.',
  RESPONSE_TOO_LARGE: 'پاسخ سرویس از اندازه مجاز بیشتر است.',
  ENDPOINT_NOT_ALLOWED: 'دامنه واردشده در فهرست مجاز سرور نیست.',
  UNSAFE_DNS_RESULT: 'نشانی شبکه سرویس امن تشخیص داده نشد.',
  REDIRECT_REJECTED: 'تغییرمسیر سرویس به دلایل امنیتی پذیرفته نشد.',
  NETWORK_ERROR: 'ارتباط شبکه با سرویس برقرار نشد.',
  DEFERRED: 'تست WebSocket در این فاز فعال نیست؛ هیچ اتصال خارجی برقرار نشد.',
  NOT_CONFIGURED: 'ابتدا اعتبارنامه‌های اتصال را تنظیم کنید.',
  CONNECTION_FAILED: 'تست اتصال ناموفق بود.',
};
const PRICE_REASON_MESSAGES: Record<string, string> = {
  NEGATIVE_PRICE: 'عدد منفی است',
  NON_FINITE_PRICE: 'عدد متناهی نیست',
  NULL_PRICE: 'مقدار null است',
  STRING_PRICE: 'مقدار رشته‌ای است',
  MISSING_PRICE: 'فیلد وجود ندارد',
  INVALID_PRICE_TYPE: 'نوع داده عددی نیست',
};

const stateLabel: Record<string, string> = {
  DISABLED: 'اتصال غیرفعال است',
  NOT_CONFIGURED: 'اعتبارنامه تنظیم نشده',
  NEVER_TESTED: 'هنوز آزمایش نشده',
  LAST_TEST_SUCCESS: 'آخرین آزمایش موفق بود',
  LAST_TEST_WARNING: 'آخرین آزمایش با هشدار داده‌ای انجام شد',
  LAST_TEST_FAILED: 'آخرین آزمایش ناموفق بود',
};

export function ConnectSettingsPage() {
  const { user } = useAuth();
  const canRead = hasPermission(user?.permissions, 'connect.settings.read');
  const canReadStatus = hasPermission(user?.permissions, 'connect.status.read');
  const canManage = hasPermission(user?.permissions, 'connect.settings.manage');
  const canTest = hasPermission(user?.permissions, 'connect.connection.test');
  const { data, error, isLoading, mutate } = useSWR(canRead ? 'connect-settings' : null, () =>
    connectSettingsApi.get(),
  );
  const { data: status, mutate: mutateStatus } = useSWR(
    canReadStatus ? 'connect-status' : null,
    () => connectSettingsApi.status(),
  );
  const [httpBaseUrl, setHttpBaseUrl] = useState('https://connect.tala-app.ir');
  const [websocketUrl, setWebsocketUrl] = useState('wss://connect.tala-app.ir/ws');
  const [isEnabled, setIsEnabled] = useState(false);
  const [priceSyncEnabled, setPriceSyncEnabled] = useState(false);
  const [externalBuyEnabled, setExternalBuyEnabled] = useState(false);
  const [externalSellEnabled, setExternalSellEnabled] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [accessSecret, setAccessSecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<'http' | 'websocket' | null>(null);
  const [result, setResult] = useState<ConnectTestResult | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    success: boolean;
    warning?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!data) return;
    setHttpBaseUrl(data.httpBaseUrl);
    setWebsocketUrl(data.websocketUrl);
    setIsEnabled(data.isEnabled);
    setPriceSyncEnabled(data.priceSyncEnabled);
    setExternalBuyEnabled(data.externalBuyEnabled);
    setExternalSellEnabled(data.externalSellEnabled);
    setAccessKey('');
    setAccessSecret('');
    setWebhookSecret('');
  }, [data]);

  const dirty = useMemo(() => {
    if (!data) return false;
    return (
      httpBaseUrl !== data.httpBaseUrl ||
      websocketUrl !== data.websocketUrl ||
      isEnabled !== data.isEnabled ||
      priceSyncEnabled !== data.priceSyncEnabled ||
      externalBuyEnabled !== data.externalBuyEnabled ||
      externalSellEnabled !== data.externalSellEnabled ||
      Boolean(accessKey || accessSecret || webhookSecret)
    );
  }, [
    data,
    httpBaseUrl,
    websocketUrl,
    isEnabled,
    priceSyncEnabled,
    externalBuyEnabled,
    externalSellEnabled,
    accessKey,
    accessSecret,
    webhookSecret,
  ]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  if (!canRead) return <ForbiddenNotice permission="connect.settings.read" />;

  async function save() {
    if (!canManage) return;
    setSaving(true);
    setMessage(null);
    setResult(null);
    try {
      const updated = await connectSettingsApi.update({
        httpBaseUrl,
        websocketUrl,
        isEnabled,
        priceSyncEnabled,
        externalBuyEnabled,
        externalSellEnabled,
        ...(accessKey ? { accessKey } : {}),
        ...(accessSecret ? { accessSecret } : {}),
        ...(webhookSecret ? { webhookSecret } : {}),
      });
      await mutate(updated, { revalidate: false });
      setAccessKey('');
      setAccessSecret('');
      setWebhookSecret('');
      setMessage({ text: 'تنظیمات اتصال ذخیره شد.', success: true });
    } catch (err) {
      setMessage({ text: errorMessage(err), success: false });
    } finally {
      setSaving(false);
    }
  }

  async function test(method: 'http' | 'websocket') {
    if (!canTest || dirty) {
      setMessage({ text: 'ابتدا تغییرات را ذخیره کنید.', success: false });
      return;
    }
    setTesting(method);
    setMessage(null);
    setResult(null);
    try {
      const checked =
        method === 'http'
          ? await connectSettingsApi.testHttp()
          : await connectSettingsApi.testWebSocket();
      setResult(checked);
      await Promise.all([mutate(), mutateStatus()]);
      const connectionStatus =
        checked.connectionStatus ?? (checked.success ? 'CONNECTED_VALID' : 'CONNECTION_FAILED');
      const warning = connectionStatus === 'CONNECTED_WITH_WARNINGS';
      const valid = connectionStatus === 'CONNECTED_VALID';
      setMessage({
        text: warning
          ? `اتصال HTTP برقرار است، اما اعتبار داده‌ها هشدار دارد: ${formatCount(checked.validProductsCount ?? null)} محصول معتبر و ${formatCount(checked.invalidProductsCount ?? null)} محصول نامعتبر از ${formatCount(checked.productsCount ?? null)} محصول.`
          : valid
            ? 'اتصال HTTP برقرار است و همه محصولات از نظر ساختار معتبرند.'
            : (ERROR_MESSAGES[checked.errorCode ?? ''] ?? 'تست اتصال ناموفق بود.'),
        success: valid,
        warning,
      });
    } catch (err) {
      setMessage({ text: errorMessage(err), success: false });
    } finally {
      setTesting(null);
    }
  }

  async function removeSecret(
    secret: 'accessKey' | 'accessSecret' | 'webhookSecret',
    label: string,
  ) {
    if (!window.confirm(`اطلاعات ${label} حذف شود؟`)) return;
    try {
      const updated = await connectSettingsApi.removeSecret(secret);
      await mutate(updated, { revalidate: false });
      setMessage({ text: `${label} حذف شد.`, success: true });
    } catch (err) {
      setMessage({ text: errorMessage(err), success: false });
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="اتصال به تأمین‌کننده Connect"
        description="مدیریت ارتباط با سرویس قیمت‌گذاری و معاملات خارجی"
      />
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorMessage(error)}
        </div>
      ) : null}
      {isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          در حال بارگذاری تنظیمات…
        </p>
      ) : null}
      {message ? (
        <div
          role="status"
          className={`rounded-lg border p-4 text-sm ${message.warning ? 'border-amber-200 bg-amber-50 text-amber-900' : message.success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}
        >
          {message.text}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-gold-600" />
            وضعیت اتصال
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <b>وضعیت پیکربندی:</b> {stateLabel[status?.connectionState ?? 'NEVER_TESTED']}
          </p>
          <p>
            <b>آخرین تست HTTP:</b> {formatStatus(data?.lastHttpCheckStatus, data?.lastHttpCheckAt)}
          </p>
          <p>
            <b>آخرین تست WebSocket:</b>{' '}
            {formatStatus(data?.lastWebSocketCheckStatus, data?.lastWebSocketCheckAt)}
          </p>
          <p>
            <b>آخرین تست موفق:</b> {formatDate(data?.lastSuccessfulCheckAt)}
          </p>
          {data?.lastConnectionErrorCode ? (
            <p>
              <b>خطای پالایش‌شده:</b> <span dir="ltr">{data.lastConnectionErrorCode}</span> —{' '}
              {ERROR_MESSAGES[data.lastConnectionErrorCode] ?? 'خطای اتصال'}
            </p>
          ) : null}
          {!result?.diagnostic &&
          isProductValidationError(data?.lastConnectionErrorCode ?? null) ? (
            <p className="text-amber-700">
              جزئیات فیلد در کارت وضعیت اتصال موجود نیست؛ برای مشاهده آن، تست HTTP را دوباره اجرا
              کنید.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            نتیجه آخرین تست، اتصال دائمی را نشان نمی‌دهد. همگام‌سازی قیمت و معامله در این فاز
            غیرفعال است.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlugZap className="h-5 w-5 text-gold-600" />
            اطلاعات اتصال
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Input
            label="نشانی پایه HTTP"
            value={httpBaseUrl}
            onChange={(e) => setHttpBaseUrl(e.target.value)}
            dir="ltr"
            disabled={!canManage}
          />
          <Input
            label="نشانی WebSocket"
            value={websocketUrl}
            onChange={(e) => setWebsocketUrl(e.target.value)}
            dir="ltr"
            disabled={!canManage}
          />
          <SecretField
            label="Access Key"
            value={accessKey}
            onChange={setAccessKey}
            configured={data?.accessKeyConfigured ?? false}
            disabled={!canManage}
            onRemove={() => void removeSecret('accessKey', 'Access Key')}
          />
          <SecretField
            label="Access Secret"
            value={accessSecret}
            onChange={setAccessSecret}
            configured={data?.accessSecretConfigured ?? false}
            disabled={!canManage}
            onRemove={() => void removeSecret('accessSecret', 'Access Secret')}
          />
          <SecretField
            label="Webhook Secret"
            value={webhookSecret}
            onChange={setWebhookSecret}
            configured={data?.webhookSecretConfigured ?? false}
            disabled={!canManage}
            onRemove={() => void removeSecret('webhookSecret', 'Webhook Secret')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-gold-600" />
            قابلیت‌های آینده
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            label="فعال‌سازی تنظیمات اتصال"
            checked={isEnabled}
            onChange={setIsEnabled}
            disabled={!canManage}
          />
          <Toggle
            label="دریافت قیمت از Connect"
            checked={priceSyncEnabled}
            onChange={setPriceSyncEnabled}
            disabled={!canManage}
          />
          <Toggle
            label="خرید از Connect"
            checked={externalBuyEnabled}
            onChange={setExternalBuyEnabled}
            disabled
          />
          <Toggle
            label="فروش به Connect"
            checked={externalSellEnabled}
            onChange={setExternalSellEnabled}
            disabled
          />
          <p className="text-xs text-amber-800">
            خرید و فروش خارجی در فازهای بعدی بررسی می‌شود. در حال حاضر هیچ سفارشی ارسال نمی‌شود.
          </p>
          {canManage ? (
            <Button onClick={() => void save()} isLoading={saving}>
              ذخیره تنظیمات
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-gold-600" />
            تست اتصال
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            تست HTTP فقط فهرست محصولات را می‌خواند و داده‌ای را ذخیره نمی‌کند.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => void test('http')}
              isLoading={testing === 'http'}
              disabled={!canTest || dirty}
            >
              تست اتصال HTTP
            </Button>
            <Button variant="outline" disabled>
              تست WebSocket (غیرفعال در این فاز)
            </Button>
          </div>
          {result ? (
            <div
              className={`rounded-lg border p-3 text-sm ${result.connectionStatus === 'CONNECTED_VALID' || (!result.connectionStatus && result.success) ? 'border-emerald-200 bg-emerald-50' : result.connectionStatus === 'CONNECTED_WITH_WARNINGS' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}
              role="status"
            >
              <p>
                <b>وضعیت اتصال:</b>{' '}
                {result.connectionStatus
                  ? healthLabel(result.connectionStatus)
                  : result.success
                    ? 'تست موفق'
                    : (ERROR_MESSAGES[result.errorCode ?? ''] ?? 'تست ناموفق')}
              </p>
              {result.httpConnected !== undefined ? (
                <p>ارتباط HTTP: {result.httpConnected ? 'برقرار' : 'برقرار نشد'}</p>
              ) : null}
              {result.dataValidationStatus ? (
                <p>اعتبار داده‌ها: {dataValidationLabel(result.dataValidationStatus)}</p>
              ) : null}
              {result.diagnostic ? (
                <details className="mt-2 rounded-md bg-muted/40 p-3">
                  <summary className="cursor-pointer font-medium">جزئیات پالایش‌شده پاسخ</summary>
                  <p className="mt-2">
                    کل محصولات: {formatCount(result.diagnostic.productsCount)}، معتبر:{' '}
                    {result.diagnostic.validProductsCount.toLocaleString('fa-IR')}، نامعتبر:{' '}
                    {result.diagnostic.invalidProductsCount.toLocaleString('fa-IR')}
                  </p>
                  {result.diagnostic.issuesTruncated ? (
                    <p className="mt-2 text-amber-700">
                      نمایش جزئیات به ۱۰۰ مورد نخست محدود شده است.
                    </p>
                  ) : null}
                  {result.diagnostic.issues.length ? (
                    <ul className="mt-2 list-disc space-y-1 pr-5">
                      {result.diagnostic.issues.map((issue, index) => (
                        <li key={`${issue.index ?? 'response'}-${issue.field}-${index}`}>
                          {issue.index === null
                            ? 'پاسخ کلی'
                            : `محصول شماره ${(issue.index + 1).toLocaleString('fa-IR')}`}
                          : {fieldLabel(issue.field)}؛ انتظار: {typeLabel(issue.expectedType)}؛{' '}
                          دریافت‌شده: <span dir="ltr">{issue.receivedType}</span>
                          {issue.reason
                            ? `؛ علت: ${PRICE_REASON_MESSAGES[issue.reason] ?? 'نامشخص'}`
                            : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </details>
              ) : null}
              {!result.diagnostic && isProductValidationError(result.errorCode) ? (
                <p className="mt-2 text-amber-700">
                  جزئیات تشخیصی در پاسخ Backend موجود نیست؛ ممکن است Backend قدیمی باشد. صفحه را
                  تازه‌سازی کنید و در صورت تداوم، Backend را با آخرین نسخه راه‌اندازی کنید.
                </p>
              ) : null}
              {result.responseTimeMs != null ? (
                <p>زمان پاسخ: {result.responseTimeMs.toLocaleString('fa-IR')} میلی‌ثانیه</p>
              ) : null}
              {result.productsCount != null || result.validProductsCount != null ? (
                <p>
                  محصولات — کل: {formatCount(result.productsCount ?? null)}، معتبر:{' '}
                  {formatCount(result.validProductsCount ?? null)}، نامعتبر:{' '}
                  {formatCount(result.invalidProductsCount ?? null)}
                </p>
              ) : null}
              {result.pricingReady === false ? (
                <p>آمادگی برای ورود به قیمت‌گذاری: غیرفعال در این فاز</p>
              ) : null}
              <p>زمان بررسی: {formatDate(result.checkedAt)}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function SecretField({
  label,
  value,
  onChange,
  configured,
  disabled,
  onRemove,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  configured: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2">
      <Input
        label={label}
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
        dir="ltr"
        disabled={disabled}
        placeholder={configured ? 'برای حفظ مقدار فعلی خالی بگذارید' : 'تنظیم نشده'}
        hint={configured ? 'مقدار ذخیره‌شده نمایش داده نمی‌شود.' : 'هنوز تنظیم نشده است.'}
      />
      {configured && !disabled ? (
        <button type="button" className="text-xs text-red-600 underline" onClick={onRemove}>
          حذف مستقل {label}
        </button>
      ) : null}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-amber-600"
      />
      <span>
        {label}
        {label.includes('خرید') || label.includes('فروش') ? (
          <span className="mt-1 block text-xs text-muted-foreground">
            این قابلیت در فازهای بعدی فعال خواهد شد و در حال حاضر هیچ سفارشی ارسال نمی‌شود.
          </span>
        ) : null}
      </span>
    </label>
  );
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString('fa-IR') : 'ثبت نشده';
}
function formatCount(value: number | null) {
  return value === null ? 'نامشخص' : value.toLocaleString('fa-IR');
}
function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    id: 'شناسه',
    title: 'عنوان',
    buy_price: 'قیمت خرید',
    sell_price: 'قیمت فروش',
    is_active: 'وضعیت فعال‌بودن',
    is_buy_active: 'وضعیت خرید',
    is_sell_active: 'وضعیت فروش',
    data: 'فهرست محصولات',
    $product: 'ساختار محصول',
  };
  return labels[field] ?? 'فیلد ناشناخته';
}
function isProductValidationError(errorCode: string | null) {
  return (
    Boolean(errorCode?.startsWith('INVALID_PRODUCT')) ||
    errorCode === 'INVALID_PRODUCTS_RESPONSE' ||
    errorCode === 'INVALID_BUY_PRICE' ||
    errorCode === 'INVALID_SELL_PRICE'
  );
}
function typeLabel(expectedType: string) {
  const labels: Record<string, string> = {
    array: 'آرایه',
    object: 'شیء',
    boolean: 'مقدار بولی',
    'finite non-negative number': 'عدد متناهی و نامنفی',
    'non-empty string (max 200 characters)': 'رشته غیرخالی با حداکثر ۲۰۰ نویسه',
    'non-empty string (max 300 characters)': 'رشته غیرخالی با حداکثر ۳۰۰ نویسه',
  };
  return labels[expectedType] ?? expectedType;
}
function formatStatus(value?: string | null, at?: string | null) {
  return value
    ? `${value === 'SUCCESS' ? 'موفق' : value === 'WARNING' ? 'موفق با هشدار' : 'ناموفق'} — ${formatDate(at)}`
    : 'آزمایش نشده';
}
function healthLabel(status: string) {
  const labels: Record<string, string> = {
    CONNECTED_VALID: 'اتصال برقرار؛ همه محصولات معتبر',
    CONNECTED_WITH_WARNINGS: 'اتصال برقرار؛ برخی محصولات نامعتبرند',
    CONNECTION_FAILED: 'اتصال یا اعتبارسنجی پاسخ ناموفق',
  };
  return labels[status] ?? 'وضعیت نامشخص';
}
function dataValidationLabel(status: string) {
  const labels: Record<string, string> = {
    VALID: 'همه محصولات معتبر',
    PARTIAL: 'اعتبارسنجی ناقص؛ بخشی از محصولات نامعتبر',
    INVALID: 'هیچ محصول معتبری وجود ندارد',
    INVALID_RESPONSE: 'ساختار اصلی پاسخ نامعتبر',
    NOT_CHECKED: 'بررسی داده انجام نشد',
  };
  return labels[status] ?? 'وضعیت نامشخص';
}
function errorMessage(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  return 'عملیات انجام نشد. ورودی‌ها و دسترسی را بررسی کنید.';
}
