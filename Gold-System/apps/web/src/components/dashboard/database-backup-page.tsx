'use client';

import { useState } from 'react';
import { DatabaseBackup, Download, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/dashboard/page-header';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { useAuth } from '@/lib/auth';
import { fetchBlob } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';
import { Input } from '@/components/ui/input';
import { restoreDatabase, type DatabaseRestoreResult } from '@/lib/database-backup-api';
import { BackupStoragePanel } from './backup-storage-panel';

export function DatabaseBackupPage() {
  const { user, logout } = useAuth();
  const canBackup = hasPermission(user?.permissions, 'database.backup.create');
  const canRestore = hasPermission(user?.permissions, 'database.backup.restore');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [trusted, setTrusted] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const [restoreResult, setRestoreResult] = useState<DatabaseRestoreResult | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);

  if (!canBackup) return <ForbiddenNotice permission="database.backup.create" />;

  async function downloadBackup() {
    setDownloading(true);
    setError('');
    setSuccess(false);
    try {
      const blob = await fetchBlob('/admin/database-backup/download');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `gold-database-${new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z')}.dump`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSuccess(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'گرفتن نسخه پشتیبان ناموفق بود.');
    } finally {
      setDownloading(false);
    }
  }

  async function submitRestore(event: React.FormEvent) {
    event.preventDefault();
    if (!restoreFile || confirmation !== 'RESTORE' || !trusted || restoring) return;
    if (restoreFile.size > 256 * 1024 * 1024) {
      setRestoreError('حجم فایل نباید بیشتر از ۲۵۶ مگابایت باشد.');
      return;
    }
    setRestoring(true);
    setRestoreError('');
    try {
      setRestoreResult(await restoreDatabase(restoreFile, confirmation));
      setConfirmation('');
    } catch (reason) {
      setRestoreError(reason instanceof Error ? reason.message : 'بازیابی انجام نشد.');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="پشتیبان اضطراری پایگاه داده"
        description="ساخت و دریافت یک نسخه کامل از پایگاه داده سامانه برای شرایط اضطراری."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseBackup className="h-5 w-5" />
            دریافت نسخه پشتیبان
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
            <ShieldAlert className="mt-1 h-5 w-5 shrink-0" />
            <p>
              این ابزار فقط برای تهیه دستی نسخه اضطراری است. فایل پشتیبان شامل اطلاعات کامل پایگاه
              داده است؛ آن را در محل امن نگه دارید. فایل‌های آپلودشده و تنظیمات سرور در این نسخه
              قرار نمی‌گیرند.
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {success ? (
            <p role="status" className="text-sm text-green-700">
              دانلود نسخه پشتیبان آغاز شد.
            </p>
          ) : null}

          <Button
            onClick={downloadBackup}
            disabled={downloading || restoring || storageBusy || !!restoreResult}
          >
            <Download className="ml-2 h-4 w-4" />
            {downloading ? 'در حال تهیه نسخه پشتیبان…' : 'تهیه و دانلود نسخه پشتیبان'}
          </Button>
        </CardContent>
      </Card>

      <BackupStoragePanel
        disabled={downloading || restoring || !!restoreResult}
        onBusyChange={setStorageBusy}
      />

      {canRestore ? (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle>بازیابی پایگاه داده (ریستور)</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitRestore} className="space-y-5">
              <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-900">
                اطلاعات فعلی با اطلاعات فایل انتخاب‌شده جایگزین می‌شود. فقط بک‌آپ معتبر همین سامانه
                و همین نسخه نرم‌افزار را انتخاب کنید. هنگام بازیابی، دسترسی به سامانه موقتاً متوقف
                می‌شود. ابتدا یک نسخه از وضعیت فعلی روی سرور ذخیره می‌شود.
              </p>
              <div className="space-y-2">
                <label htmlFor="restore-file" className="text-sm font-medium">
                  فایل بک‌آپ (حداکثر ۲۵۶ مگابایت)
                </label>
                <Input
                  id="restore-file"
                  type="file"
                  accept=".dump"
                  disabled={restoring || !!restoreResult}
                  onChange={(event) => {
                    setRestoreFile(event.target.files?.[0] || null);
                    setRestoreError('');
                    setConfirmation('');
                    setTrusted(false);
                  }}
                />
              </div>
              <label className="flex items-start gap-2 text-sm leading-7">
                <input
                  type="checkbox"
                  className="mt-2"
                  checked={trusted}
                  disabled={restoring || !!restoreResult}
                  onChange={(event) => setTrusted(event.target.checked)}
                />
                فایل از منبع مورد اعتماد است و جایگزینی اطلاعات فعلی را تأیید می‌کنم.
              </label>
              <div className="space-y-2">
                <label htmlFor="restore-confirmation" className="text-sm">
                  برای تأیید نهایی عبارت <span dir="ltr">RESTORE</span> را بنویسید.
                </label>
                <Input
                  id="restore-confirmation"
                  dir="ltr"
                  autoComplete="off"
                  value={confirmation}
                  disabled={restoring || !!restoreResult}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </div>
              {restoring ? (
                <p role="status" className="text-sm">
                  در حال بررسی فایل، تهیه نسخه بازگشت و بازیابی… تا پایان عملیات این صفحه را باز نگه
                  دارید.
                </p>
              ) : null}
              {restoreError ? (
                <p role="alert" className="text-sm text-red-700">
                  {restoreError}
                </p>
              ) : null}
              {restoreResult ? (
                <div
                  role="status"
                  className="space-y-3 rounded-lg bg-green-50 p-4 text-sm text-green-900"
                >
                  <p>{restoreResult.message}</p>
                  <p>
                    نام نسخه پیش از بازیابی روی سرور:{' '}
                    <span dir="ltr" className="break-all">
                      {restoreResult.recoveryFileName}
                    </span>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      await logout();
                      window.location.assign('/dashboard/login');
                    }}
                  >
                    خروج و ورود دوباره
                  </Button>
                </div>
              ) : null}
              <Button
                type="submit"
                variant="destructive"
                disabled={
                  !restoreFile ||
                  confirmation !== 'RESTORE' ||
                  !trusted ||
                  restoring ||
                  downloading ||
                  storageBusy ||
                  !!restoreResult
                }
              >
                {restoring ? 'بازیابی در حال انجام است…' : 'تأیید و جایگزینی اطلاعات'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          ابزار ریستور فقط برای مدیر سامانه در دسترس است.
        </p>
      )}
    </div>
  );
}
