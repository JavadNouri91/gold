'use client';

import { useEffect, useId, useRef, useState } from 'react';
import useSWR from 'swr';
import { ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Toast } from '@/components/dashboard/customer-widgets';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ActiveSessionsPanel } from '@/components/sessions/active-sessions-panel';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { MobileInput, MobileNumber } from '@/components/ui/mobile-input';
import { ApiClientError, authApi, type AuthSession } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  sessionPolicyApi,
  type RoleSessionPolicyRow,
  type SessionLimitType,
  type SessionLoginBehavior,
  type SessionPolicyFields,
  type UserSessionPolicyMode,
} from '@/lib/internal-api';
import { hasPermission } from '@/lib/permissions';
import { cn, latinMobile, toPersianDigits } from '@/lib/utils';

const LIMIT_OPTIONS = [
  { value: '1', label: '۱' },
  { value: '2', label: '۲' },
  { value: '3', label: '۳' },
  { value: '5', label: '۵' },
  { value: 'unlimited', label: 'نامحدود' },
] as const;

const BEHAVIOR_LABEL: Record<SessionLoginBehavior, string> = {
  BLOCK: 'مسدود کردن ورود جدید',
  REVOKE_OLDEST: 'لغو قدیمی‌ترین نشست',
  REQUIRE_CONFIRMATION: 'نیاز به تأیید',
};

function limitValue(policy: { limitType: SessionLimitType | null; maxSessions: number | null }) {
  if (policy.limitType === 'UNLIMITED') return 'unlimited';
  return String(policy.maxSessions ?? 1);
}

function limitLabel(policy: { limitType: SessionLimitType | null; maxSessions: number | null; useDefault?: boolean }) {
  if (policy.useDefault) return 'پیش‌فرض';
  if (policy.limitType === 'UNLIMITED') return 'نامحدود';
  return toPersianDigits(String(policy.maxSessions ?? '—'));
}

function concurrencyFieldsFromLimit(
  limit: string,
  loginBehavior: SessionLoginBehavior,
): Pick<SessionPolicyFields, 'limitType' | 'maxSessions' | 'loginBehavior'> {
  if (limit === 'unlimited') {
    return { limitType: 'UNLIMITED', maxSessions: null, loginBehavior };
  }
  return { limitType: 'LIMITED', maxSessions: Number(limit), loginBehavior };
}

function globalPolicyFields(
  limit: string,
  loginBehavior: SessionLoginBehavior,
  idleTimeoutMinutes: number | null,
  maxSessionDurationMinutes: number | null,
): SessionPolicyFields {
  return {
    ...concurrencyFieldsFromLimit(limit, loginBehavior),
    idleTimeoutMinutes,
    maxSessionDurationMinutes,
  };
}

const IDLE_TIMEOUT_PRESETS = [
  { value: '15', label: '۱۵ دقیقه' },
  { value: '30', label: '۳۰ دقیقه' },
  { value: '60', label: '۱ ساعت' },
  { value: '120', label: '۲ ساعت' },
  { value: '480', label: '۸ ساعت' },
] as const;

const MAX_DURATION_PRESETS = [
  { value: '60', label: '۱ ساعت' },
  { value: '480', label: '۸ ساعت' },
  { value: '1440', label: '۲۴ ساعت' },
  { value: '10080', label: '۷ روز' },
  { value: '43200', label: '۳۰ روز' },
] as const;

type MinutePreset = { value: string; label: string };

function normalizeMinutesFromApi(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function minutesSelectValue(value: number | null | undefined) {
  if (value == null) return 'off';
  return String(value);
}

function minutesFromSelect(value: string): number | null {
  if (value === 'off') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function PolicySelect({
  value,
  onChange,
  disabled,
  options,
  labelledBy,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  options: readonly { value: string; label: string }[];
  labelledBy?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelledBy}
        aria-controls={listId}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{selected?.label ?? 'انتخاب کنید'}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground', open && 'rotate-180')} />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelledBy}
          className="absolute end-0 start-0 z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-input bg-card py-1 text-sm text-foreground shadow-md"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center px-3 py-2 text-right hover:bg-muted',
                    isSelected && 'bg-muted font-medium',
                  )}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function minuteOptionLabel(minutes: number): string {
  if (minutes % 10_080 === 0 && minutes >= 10_080) {
    return `${toPersianDigits(String(minutes / 10_080))} روز`;
  }
  if (minutes % 1440 === 0 && minutes >= 1440) {
    return `${toPersianDigits(String(minutes / 1440))} روز`;
  }
  if (minutes % 60 === 0 && minutes >= 60) {
    return `${toPersianDigits(String(minutes / 60))} ساعت`;
  }
  return `${toPersianDigits(String(minutes))} دقیقه`;
}

function minuteSelectOptions(presets: readonly MinutePreset[], savedMinutes: number | null): MinutePreset[] {
  const options: MinutePreset[] = [{ value: 'off', label: 'غیرفعال' }, ...presets];
  if (savedMinutes == null) return options;
  const key = String(savedMinutes);
  if (options.some((option) => option.value === key)) return options;
  return [...options, { value: key, label: minuteOptionLabel(savedMinutes) }];
}

function messageOf(error: unknown) {
  return error instanceof ApiClientError ? error.message : 'ذخیره انجام نشد.';
}

export function SessionManagementPage() {
  const { user, logout } = useAuth();
  const canSettings = hasPermission(user?.permissions, 'session.policy.manage');
  const canUsers = hasPermission(user?.permissions, ['session.policy.manage', 'user.manage']);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success');

  const notify = (message: string, tone: 'success' | 'error' = 'success') => {
    setToastTone(tone);
    setToast(message);
  };

  if (!canSettings && !canUsers) return <ForbiddenNotice permission="session.policy.manage" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="مدیریت نشست"
        description="تنظیمات ← امنیت ← مدیریت نشست. اولویت اعمال: استثنای کاربر، سپس نقش، سپس پیش‌فرض سراسری."
      />
      {canSettings ? <GlobalSection onSaved={() => notify('پیش‌فرض سراسری ذخیره شد.')} onError={(error) => notify(messageOf(error), 'error')} /> : null}
      {canSettings ? <RoleSection onSaved={() => notify('سیاست نقش ذخیره شد.')} onError={(error) => notify(messageOf(error), 'error')} /> : null}
      {canUsers ? (
        <UserSection
          currentUserId={user?.id ?? ''}
          onSaved={() => notify('استثنای کاربر ذخیره شد.')}
          onError={(error) => notify(messageOf(error), 'error')}
          onSessionChanged={(text) => notify(text)}
          onCurrentRevoked={() => void logout()}
        />
      ) : null}
      <OwnSessions onChanged={(text) => notify(text)} onCurrentRevoked={() => void logout()} onError={(error) => notify(messageOf(error), 'error')} />
      <Toast message={toast} tone={toastTone} onClose={() => setToast(null)} />
    </div>
  );
}

type GlobalPolicyDraft = {
  limit?: string;
  behavior?: SessionLoginBehavior;
  idleMinutes?: string;
  maxDurationMinutes?: string;
};

function GlobalSection({ onSaved, onError }: { onSaved: () => void; onError: (error: unknown) => void }) {
  const policy = useSWR('session-policy-global', () => sessionPolicyApi.getGlobal());
  const [draft, setDraft] = useState<GlobalPolicyDraft>({});
  const [saving, setSaving] = useState(false);

  const savedIdle = normalizeMinutesFromApi(policy.data?.idleTimeoutMinutes);
  const savedMaxDuration = normalizeMinutesFromApi(policy.data?.maxSessionDurationMinutes);

  useEffect(() => {
    setDraft({});
  }, [
    policy.data?.limitType,
    policy.data?.maxSessions,
    policy.data?.loginBehavior,
    savedIdle,
    savedMaxDuration,
  ]);

  const currentLimit = draft.limit ?? (policy.data ? limitValue(policy.data) : '1');
  const currentBehavior = draft.behavior ?? policy.data?.loginBehavior ?? 'BLOCK';
  const currentIdle = draft.idleMinutes ?? minutesSelectValue(savedIdle);
  const currentMaxDuration = draft.maxDurationMinutes ?? minutesSelectValue(savedMaxDuration);

  return (
    <Card className="overflow-visible">
      <CardHeader>
        <CardTitle>پیش‌فرض سراسری</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {policy.error ? <Alert variant="error">تنظیمات سراسری بارگذاری نشد.</Alert> : null}
        <div className="space-y-1 text-sm">
          <p id="session-limit-label" className="font-medium">
            حداکثر نشست هم‌زمان
          </p>
          <PolicySelect
            labelledBy="session-limit-label"
            value={currentLimit}
            disabled={!policy.data || saving}
            onChange={(value) => setDraft((prev) => ({ ...prev, limit: value }))}
            options={LIMIT_OPTIONS}
          />
          <p className="text-xs text-muted-foreground">
            برای نقش‌ها و کاربرانی که تنظیم جداگانه ندارند اعمال می‌شود. مقدار اولیه ۱ است.
          </p>
        </div>
        <div className="space-y-1 text-sm">
          <p id="session-behavior-label" className="font-medium">
            وقتی سقف پر است و ورود جدید انجام می‌شود
          </p>
          <PolicySelect
            labelledBy="session-behavior-label"
            value={currentBehavior}
            disabled={!policy.data || saving}
            onChange={(value) => setDraft((prev) => ({ ...prev, behavior: value as SessionLoginBehavior }))}
            options={[
              { value: 'BLOCK', label: 'مسدود کردن ورود جدید' },
              { value: 'REVOKE_OLDEST', label: 'لغو قدیمی‌ترین نشست فعال' },
              { value: 'REQUIRE_CONFIRMATION', label: 'نیاز به تأیید / رفتار تعریف‌شده توسط مدیر' },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            مسدود کردن، ورود را رد می‌کند. لغو قدیمی‌ترین، نشست قبلی را باطل می‌کند و حذف نمی‌کند. تأیید، تا انتخاب یک نشست فعال ورود را کامل نمی‌کند.
          </p>
        </div>
        <div className="space-y-1 text-sm">
          <p id="session-idle-label" className="font-medium">
            حداکثر زمان بدون فعالیت
          </p>
          <PolicySelect
            labelledBy="session-idle-label"
            value={currentIdle}
            disabled={!policy.data || saving}
            onChange={(value) => setDraft((prev) => ({ ...prev, idleMinutes: value }))}
            options={minuteSelectOptions(IDLE_TIMEOUT_PRESETS, minutesFromSelect(currentIdle))}
          />
          <p className="text-xs text-muted-foreground">
            پس از این مدت بدون درخواست API یا تازه‌سازی توکن، نشست پایان می‌یابد و کاربر باید دوباره وارد شود.
          </p>
        </div>
        <div className="space-y-1 text-sm">
          <p id="session-max-duration-label" className="font-medium">
            حداکثر مدت نشست از زمان ورود
          </p>
          <PolicySelect
            labelledBy="session-max-duration-label"
            value={currentMaxDuration}
            disabled={!policy.data || saving}
            onChange={(value) => setDraft((prev) => ({ ...prev, maxDurationMinutes: value }))}
            options={minuteSelectOptions(MAX_DURATION_PRESETS, minutesFromSelect(currentMaxDuration))}
          />
          <p className="text-xs text-muted-foreground">
            حتی با فعالیت مداوم، پس از این مدت از لحظهٔ ورود در همان دستگاه، نشست تمام می‌شود.
          </p>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            isLoading={saving}
            disabled={!policy.data}
            onClick={() => {
              setSaving(true);
              void sessionPolicyApi
                .updateGlobal(
                  globalPolicyFields(
                    currentLimit,
                    currentBehavior,
                    minutesFromSelect(currentIdle),
                    minutesFromSelect(currentMaxDuration),
                  ),
                )
                .then(() => policy.mutate())
                .then(() => {
                  setDraft({});
                  onSaved();
                })
                .catch(onError)
                .finally(() => setSaving(false));
            }}
          >
            ذخیره پیش‌فرض
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleSection({ onSaved, onError }: { onSaved: () => void; onError: (error: unknown) => void }) {
  const roles = useSWR('session-policy-roles', () => sessionPolicyApi.listRoles());
  const [editing, setEditing] = useState<RoleSessionPolicyRow | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>سقف نشست نقش‌ها</CardTitle>
      </CardHeader>
      <CardContent>
        {roles.error ? <Alert variant="error">فهرست نقش‌ها بارگذاری نشد.</Alert> : null}
        {roles.isLoading ? <p className="text-sm text-muted-foreground">در حال بارگذاری…</p> : null}
        {!roles.isLoading && roles.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">نقشی در سامانه ثبت نشده است.</p>
        ) : null}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                {['نقش', 'سقف نشست', 'رفتار ورود', 'پیش‌فرض', 'عملیات'].map((header) => (
                  <th key={header} className="px-3 py-2 text-right font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(roles.data ?? []).map((role) => (
                <tr key={role.roleId} className="border-t">
                  <td className="px-3 py-3">
                    <p className="font-medium">{role.description || role.name}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {role.name}
                    </p>
                  </td>
                  <td className="px-3 py-3">{limitLabel(role)}</td>
                  <td className="px-3 py-3">
                    {role.useDefault || !role.loginBehavior ? 'پیش‌فرض' : BEHAVIOR_LABEL[role.loginBehavior]}
                  </td>
                  <td className="px-3 py-3">{role.useDefault ? 'بله' : 'خیر'}</td>
                  <td className="px-3 py-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditing(role)}>
                      ویرایش
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="space-y-3 md:hidden">
          {(roles.data ?? []).map((role) => (
            <li key={role.roleId} className="rounded-xl border p-3">
              <p className="font-medium">{role.description || role.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                سقف: {limitLabel(role)} · {role.useDefault ? 'از پیش‌فرض استفاده می‌کند' : 'سفارشی'}
              </p>
              <Button className="mt-3" type="button" variant="outline" size="sm" onClick={() => setEditing(role)}>
                ویرایش
              </Button>
            </li>
          ))}
        </ul>
        <RoleEditor
          role={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void roles.mutate();
            onSaved();
          }}
          onError={onError}
        />
      </CardContent>
    </Card>
  );
}

function RoleEditor({
  role,
  onClose,
  onSaved,
  onError,
}: {
  role: RoleSessionPolicyRow | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (error: unknown) => void;
}) {
  const [useDefault, setUseDefault] = useState(true);
  const [limit, setLimit] = useState('1');
  const [behavior, setBehavior] = useState<'BLOCK' | 'REVOKE_OLDEST'>('BLOCK');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!role) return;
    setUseDefault(role.useDefault);
    setLimit(role.useDefault ? '1' : limitValue(role));
    setBehavior(role.loginBehavior === 'REVOKE_OLDEST' ? 'REVOKE_OLDEST' : 'BLOCK');
  }, [role]);

  return (
    <Modal open={role != null} onClose={onClose} title="ویرایش سیاست نقش">
      {role ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSaving(true);
            const body = useDefault
              ? { useDefault: true }
              : {
                  useDefault: false,
                  ...concurrencyFieldsFromLimit(limit, behavior),
                  loginBehavior: behavior,
                };
            void sessionPolicyApi
              .updateRole(role.roleId, body)
              .then(onSaved)
              .catch(onError)
              .finally(() => setSaving(false));
          }}
        >
          <p className="text-sm text-muted-foreground">{role.description || role.name}</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useDefault} onChange={(event) => setUseDefault(event.target.checked)} />
            استفاده از پیش‌فرض سراسری
          </label>
          {useDefault ? null : (
            <>
              <LimitSelect value={limit} onChange={setLimit} />
              <BehaviorSelect value={behavior} onChange={setBehavior} />
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              انصراف
            </Button>
            <Button type="submit" isLoading={saving}>
              ذخیره
            </Button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}

function UserSection({
  currentUserId,
  onSaved,
  onError,
  onSessionChanged,
  onCurrentRevoked,
}: {
  currentUserId: string;
  onSaved: () => void;
  onError: (error: unknown) => void;
  onSessionChanged: (message: string) => void;
  onCurrentRevoked: () => void;
}) {
  const [mobile, setMobile] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const hits = useSWR(mobile.length >= 4 ? ['session-user-search', mobile] : null, () =>
    sessionPolicyApi.searchUsers(latinMobile(mobile)),
  );
  const policy = useSWR(userId ? ['session-user-policy', userId] : null, () => sessionPolicyApi.getUser(userId as string));
  const sessions = useSWR(userId ? ['session-user-sessions', userId] : null, () =>
    sessionPolicyApi.listUserSessions(userId as string),
  );
  const [mode, setMode] = useState<UserSessionPolicyMode>('INHERIT');
  const [limit, setLimit] = useState('1');
  const [behavior, setBehavior] = useState<'BLOCK' | 'REVOKE_OLDEST'>('BLOCK');
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!policy.data) return;
    setMode(policy.data.mode);
    setLimit(policy.data.mode === 'CUSTOM' ? limitValue(policy.data) : '1');
    setBehavior(policy.data.loginBehavior === 'REVOKE_OLDEST' ? 'REVOKE_OLDEST' : 'BLOCK');
  }, [policy.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>استثنای کاربر</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          پیش‌فرض، ارث‌بری از نقش است. فقط مدیران مجاز می‌توانند برای یک کاربر سیاست جدا تعریف کنند.
        </p>
        <MobileInput label="جستجوی موبایل" value={mobile} onValueChange={setMobile} />
        {hits.error ? <Alert variant="error">جستجو انجام نشد.</Alert> : null}
        <ul className="space-y-2">
          {(hits.data ?? []).map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-right text-sm hover:bg-muted"
                onClick={() => setUserId(hit.id)}
              >
                <span>{hit.name}</span>
                <MobileNumber value={hit.mobile} />
              </button>
            </li>
          ))}
        </ul>
        {policy.data ? (
          <form
            className="space-y-4 rounded-xl border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              setSaving(true);
              const body =
                mode === 'INHERIT'
                  ? { mode: 'INHERIT' as const }
                  : {
                      mode: 'CUSTOM' as const,
                      ...concurrencyFieldsFromLimit(limit, behavior),
                      loginBehavior: behavior,
                    };
              void sessionPolicyApi
                .updateUser(policy.data!.user.id, body)
                .then(() => policy.mutate())
                .then(onSaved)
                .catch(onError)
                .finally(() => setSaving(false));
            }}
          >
            <p className="text-sm font-medium">
              {policy.data.user.name} · <MobileNumber value={policy.data.user.mobile} />
            </p>
            <p className="text-xs text-muted-foreground">
              سیاست مؤثر: {policy.data.effective.limitType === 'UNLIMITED' ? 'نامحدود' : toPersianDigits(String(policy.data.effective.maxSessions))}{' '}
              نشست، {BEHAVIOR_LABEL[policy.data.effective.loginBehavior]} ({policy.data.effective.source === 'user' ? 'کاربر' : policy.data.effective.source === 'role' ? 'نقش' : 'سراسری'})
            </p>
            <div className="space-y-1 text-sm">
              <p id="session-user-mode-label" className="font-medium">
                سیاست نشست
              </p>
              <PolicySelect
                labelledBy="session-user-mode-label"
                value={mode}
                onChange={(value) => setMode(value as UserSessionPolicyMode)}
                options={[
                  { value: 'INHERIT', label: 'ارث‌بری از نقش' },
                  { value: 'CUSTOM', label: 'سفارشی' },
                ]}
              />
            </div>
            {mode === 'CUSTOM' ? (
              <>
                <LimitSelect value={limit} onChange={setLimit} />
                <BehaviorSelect value={behavior} onChange={setBehavior} />
              </>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" isLoading={saving}>
                ذخیره استثنا
              </Button>
            </div>
            <ActiveSessionsPanel
              sessions={sessions.data}
              isLoading={sessions.isLoading}
              error={sessions.error}
              pending={pending}
              onRevoke={async (session) => {
                setPending(true);
                try {
                  await sessionPolicyApi.revokeUserSession(policy.data!.user.id, session.id);
                  await sessions.mutate();
                  if (session.current && policy.data!.user.id === currentUserId) onCurrentRevoked();
                  else onSessionChanged('نشست پایان یافت.');
                } catch (error) {
                  onError(error);
                } finally {
                  setPending(false);
                }
              }}
              onRevokeOthers={async () => {
                setPending(true);
                try {
                  await sessionPolicyApi.revokeUserSessions(policy.data!.user.id);
                  await sessions.mutate();
                  onSessionChanged('سایر نشست‌ها پایان یافت.');
                } catch (error) {
                  onError(error);
                } finally {
                  setPending(false);
                }
              }}
            />
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OwnSessions({
  onChanged,
  onCurrentRevoked,
  onError,
}: {
  onChanged: (message: string) => void;
  onCurrentRevoked: () => void;
  onError: (error: unknown) => void;
}) {
  const sessions = useSWR('auth/sessions', () => authApi.sessions());
  const [pending, setPending] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>نشست‌های فعال من</CardTitle>
      </CardHeader>
      <CardContent>
        <ActiveSessionsPanel
          sessions={sessions.data}
          isLoading={sessions.isLoading}
          error={sessions.error}
          pending={pending}
          onRevoke={async (session: AuthSession) => {
            setPending(true);
            try {
              await authApi.revokeSession(session.id);
              if (session.current) onCurrentRevoked();
              else {
                await sessions.mutate();
                onChanged('نشست پایان یافت.');
              }
            } catch (error) {
              onError(error);
            } finally {
              setPending(false);
            }
          }}
          onRevokeOthers={async () => {
            setPending(true);
            try {
              await authApi.revokeOtherSessions();
              await sessions.mutate();
              onChanged('سایر نشست‌ها پایان یافت.');
            } catch (error) {
              onError(error);
            } finally {
              setPending(false);
            }
          }}
        />
      </CardContent>
    </Card>
  );
}

function LimitSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const labelId = useId();
  return (
    <div className="space-y-1 text-sm">
      <p id={labelId} className="font-medium">
        حداکثر نشست هم‌زمان
      </p>
      <PolicySelect labelledBy={labelId} value={value} onChange={onChange} options={LIMIT_OPTIONS} />
    </div>
  );
}

function BehaviorSelect({
  value,
  onChange,
}: {
  value: 'BLOCK' | 'REVOKE_OLDEST';
  onChange: (value: 'BLOCK' | 'REVOKE_OLDEST') => void;
}) {
  const labelId = useId();
  return (
    <div className="space-y-1 text-sm">
      <p id={labelId} className="font-medium">
        رفتار ورود
      </p>
      <PolicySelect
        labelledBy={labelId}
        value={value}
        onChange={(next) => onChange(next as 'BLOCK' | 'REVOKE_OLDEST')}
        options={[
          { value: 'BLOCK', label: 'مسدود کردن ورود جدید' },
          { value: 'REVOKE_OLDEST', label: 'لغو قدیمی‌ترین نشست فعال' },
        ]}
      />
    </div>
  );
}
