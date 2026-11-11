'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import {
  backupStorageApi,
  type BackupStorageInput,
  type StoredBackup,
} from '@/lib/database-backup-api';

const emptyForm: BackupStorageInput = {
  enabled: true,
  endpoint: '',
  region: 'us-east-1',
  bucket: '',
  prefix: 'emergency-backups/',
  forcePathStyle: true,
  allowHttp: false,
  accessKeyId: '',
  secretAccessKey: '',
};

export function BackupStoragePanel({
  disabled,
  onBusyChange,
}: {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { user } = useAuth();
  const canManage = hasPermission(user?.permissions, 'database.backup.storage.manage');
  const {
    data: settings,
    error: loadError,
    mutate,
  } = useSWR('emergency-backup-storage', backupStorageApi.settings, { revalidateOnFocus: false });
  const [form, setForm] = useState<BackupStorageInput>(emptyForm);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [items, setItems] = useState<StoredBackup[]>([]);
  const [listed, setListed] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    const { configured: _configured, hasCredentials: _hasCredentials, ...saved } = settings;
    setForm({
      ...saved,
      enabled: settings.configured ? saved.enabled : true,
      accessKeyId: '',
      secretAccessKey: '',
    });
  }, [settings]);

  function update<K extends keyof BackupStorageInput>(key: K, value: BackupStorageInput[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
  }

  async function run(action: string, operation: () => Promise<void>) {
    if (busy || disabled) return;
    setBusy(action);
    onBusyChange(true);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'عملیات ذخیره‌سازی انجام نشد.');
    } finally {
      setBusy('');
      onBusyChange(false);
    }
  }
  async function list(next?: string) {
    const result = await backupStorageApi.list(next);
    setItems((previous) =>
      next
        ? [
            ...previous,
            ...result.items.filter((item) => !previous.some((old) => old.key === item.key)),
          ]
        : result.items,
    );
    setCursor(result.nextCursor);
    setListed(true);
  }
  const locked = disabled || !!busy;
  const ready = settings?.configured && settings.enabled && !dirty;

  return (
    <Card>
      <CardHeader>
        <CardTitle>محل ذخیره بک‌آپ در فضای S3</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm leading-7 text-muted-foreground">
          برای نگه‌داری بک‌آپ خارج از سرور، مقصد سازگار با S3 را تنظیم کنید. باکت باید خصوصی باشد؛
          فایل شامل اطلاعات کامل پایگاه داده است.
        </p>
        {loadError ? (
          <p role="alert" className="text-sm text-red-700">
            تنظیمات بارگذاری نشد.{' '}
            <button type="button" className="underline" onClick={() => void mutate()}>
              تلاش دوباره
            </button>
          </p>
        ) : !settings ? (
          <p role="status">در حال دریافت تنظیمات…</p>
        ) : null}
        {canManage && settings ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void run('save', async () => {
                const saved = await backupStorageApi.save(form);
                await mutate(saved, false);
                setDirty(false);
                setItems([]);
                setListed(false);
                setCursor(null);
                setNotice('مقصد ذخیره شد. اکنون می‌توانید اتصال را بررسی کنید.');
              });
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              {(
                [
                  ['endpoint', 'Endpoint', 'https://s3.example.com'],
                  ['bucket', 'نام باکت', 'gold-backups'],
                  ['region', 'Region', 'us-east-1'],
                  ['prefix', 'پوشه بک‌آپ (Prefix)', 'emergency-backups/'],
                ] as const
              ).map(([key, label, placeholder]) => (
                <div key={key} className="space-y-2">
                  <label htmlFor={`backup-s3-${key}`} className="text-sm">
                    {label}
                  </label>
                  <Input
                    id={`backup-s3-${key}`}
                    dir="ltr"
                    value={form[key]}
                    placeholder={placeholder}
                    required
                    disabled={locked}
                    onChange={(event) => update(key, event.target.value)}
                  />
                </div>
              ))}
              <div className="space-y-2">
                <label htmlFor="backup-s3-access" className="text-sm">
                  Access Key ID
                </label>
                <Input
                  id="backup-s3-access"
                  dir="ltr"
                  autoComplete="off"
                  value={form.accessKeyId}
                  disabled={locked}
                  onChange={(event) => update('accessKeyId', event.target.value)}
                  placeholder={settings.hasCredentials ? 'برای حفظ کلید قبلی خالی بگذارید' : ''}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="backup-s3-secret" className="text-sm">
                  Secret Access Key
                </label>
                <Input
                  id="backup-s3-secret"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={form.secretAccessKey}
                  disabled={locked}
                  onChange={(event) => update('secretAccessKey', event.target.value)}
                  placeholder={settings.hasCredentials ? 'برای حفظ رمز قبلی خالی بگذارید' : ''}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              کلیدها روی سرور رمزگذاری می‌شوند. با تغییر Endpoint، هر دو کلید را دوباره وارد کنید.
            </p>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  disabled={locked}
                  onChange={(event) => update('enabled', event.target.checked)}
                />
                فعال بودن مقصد
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.forcePathStyle}
                  disabled={locked}
                  onChange={(event) => update('forcePathStyle', event.target.checked)}
                />
                Path-style (مانند MinIO)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.allowHttp}
                  disabled={locked}
                  onChange={(event) => update('allowHttp', event.target.checked)}
                />
                اجازه HTTP بدون TLS برای شبکه مورد اعتماد
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={locked}>
                {busy === 'save' ? 'در حال ذخیره…' : 'ذخیره مقصد'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={locked || !ready}
                onClick={() =>
                  void run('test', async () => {
                    setNotice((await backupStorageApi.test()).message);
                  })
                }
              >
                بررسی اتصال
              </Button>
            </div>
          </form>
        ) : settings ? (
          <p className="text-sm">
            {settings.enabled ? (
              <span dir="ltr">
                {settings.bucket}/{settings.prefix}
              </span>
            ) : (
              'مقصد S3 هنوز فعال نشده است.'
            )}{' '}
            تنظیم مقصد توسط مدیر سامانه انجام می‌شود.
          </p>
        ) : null}
        {dirty ? (
          <p className="text-sm text-amber-700">پیش از استفاده از مقصد، تغییرات را ذخیره کنید.</p>
        ) : null}
        <div className="flex flex-wrap gap-3 border-t pt-4">
          <Button
            disabled={locked || !ready}
            onClick={() =>
              void run('upload', async () => {
                const result = await backupStorageApi.upload();
                setNotice(`بک‌آپ ذخیره و تأیید شد: ${result.bucket}/${result.key}`);
                await list();
              })
            }
          >
            {busy === 'upload' ? 'در حال تهیه و ارسال بک‌آپ…' : 'تهیه و ذخیره بک‌آپ در S3'}
          </Button>
          <Button
            variant="outline"
            disabled={locked || !ready}
            onClick={() => void run('list', () => list())}
          >
            نمایش / به‌روزرسانی فایل‌ها
          </Button>
        </div>
        {notice ? (
          <p role="status" className="break-words text-sm text-green-700">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {listed && !items.length ? (
          <p className="text-sm text-muted-foreground">در این صفحه فایلی با پسوند dump یافت نشد.</p>
        ) : null}
        {items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2">فایل</th>
                  <th className="p-2">حجم</th>
                  <th className="p-2">زمان ذخیره</th>
                  <th className="p-2">دریافت</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.key} className="border-b">
                    <td className="max-w-xs break-all p-2" dir="ltr">
                      {item.key}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {(item.size / 1024 / 1024).toLocaleString('fa-IR', {
                        maximumFractionDigits: 2,
                      })}{' '}
                      مگابایت
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {item.lastModified
                        ? new Date(item.lastModified).toLocaleString('fa-IR')
                        : '—'}
                    </td>
                    <td className="p-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={locked || !ready}
                        onClick={() =>
                          void run('download', async () => {
                            const blob = await backupStorageApi.download(item.key);
                            const url = URL.createObjectURL(blob);
                            const anchor = document.createElement('a');
                            anchor.href = url;
                            anchor.download = item.key.split('/').pop() || 'backup.dump';
                            document.body.appendChild(anchor);
                            anchor.click();
                            anchor.remove();
                            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                          })
                        }
                      >
                        دانلود
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {cursor ? (
          <Button
            variant="outline"
            disabled={locked || !ready}
            onClick={() => void run('list', () => list(cursor))}
          >
            فایل‌های بیشتر
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          برای ریستور، فایل را دانلود و در بخش بازیابی همین صفحه انتخاب کنید. بازیابی فایل تا ۲۵۶
          مگابایت پشتیبانی می‌شود.
        </p>
      </CardContent>
    </Card>
  );
}
