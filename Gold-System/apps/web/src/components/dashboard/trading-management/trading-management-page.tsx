'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { jalaaliMonthLength, toGregorian, toJalaali } from 'jalaali-js';
import { PageHeader } from '@/components/dashboard/page-header';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { ApiErrorState, SkeletonBlock } from '@/components/dashboard/states';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { tradingApi, type TradingMarker, type TradingSessionBody, type TradingSessionView } from '@/lib/internal-api';
import { hasPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { CopyDialog, OverrideDialog, SessionDialog, type SessionDraft } from './trading-dialogs';
import { AuditPanel, HolidaysPanel, LimitsPanel, Overview, WeeklyPanel, shiftMonth } from './trading-panels';

const TABS = [
  { id: 'overview', label: 'نمای کلی' },
  { id: 'weekly', label: 'برنامه هفتگی' },
  { id: 'limits', label: 'محدودیت‌ها' },
  { id: 'holidays', label: 'تقویم تعطیلات' },
  { id: 'exceptions', label: 'استثنائات روزانه' },
  { id: 'audit', label: 'تاریخچه تغییرات' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const READ = [
  'trading.schedule.view',
  'trading.schedule.manage',
  'trading.limits.view',
  'trading.limits.manage',
  'trading.holidays.manage',
  'trading.audit.view',
] as const;

function iso(gy: number, gm: number, gd: number): string {
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

function monthRange(jy: number, jm: number) {
  const start = toGregorian(jy, jm, 1);
  const end = toGregorian(jy, jm, jalaaliMonthLength(jy, jm));
  return { from: iso(start.gy, start.gm, start.gd), to: iso(end.gy, end.gm, end.gd) };
}

function messageOf(error: unknown): string {
  if (error instanceof ApiClientError || error instanceof Error) return error.message;
  return 'ثبت تغییرات انجام نشد.';
}

export function TradingManagementPage() {
  const { user } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const requested = search.get('tab');
  const tab: TabId = TABS.some((item) => item.id === requested) ? (requested as TabId) : 'overview';
  const permissions = user?.permissions;
  const allowed = hasPermission(permissions, READ);
  const canSchedule = hasPermission(permissions, 'trading.schedule.manage');
  const canLimits = hasPermission(permissions, 'trading.limits.manage');
  const canHolidays = hasPermission(permissions, 'trading.holidays.manage');
  const canAudit = hasPermission(permissions, 'trading.audit.view');

  const initial = toJalaali(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  const [month, setMonth] = useState({ jy: initial.jy, jm: initial.jm });
  const range = useMemo(() => monthRange(month.jy, month.jm), [month.jy, month.jm]);
  const overview = useSWR(allowed ? ['trading-overview', range.from, range.to] : null, () => tradingApi.overview(range));
  const audit = useSWR(allowed && tab === 'audit' && canAudit ? 'trading-audit' : null, () =>
    tradingApi.audit({ limit: 30, offset: 0 }),
  );

  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [copySource, setCopySource] = useState<TradingSessionView | null>(null);
  const [overrideOpen, setOverrideOpen] = useState<{ marker: TradingMarker | null; date: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const setTab = (id: string) => {
    const next = new URLSearchParams(search.toString());
    if (id === 'overview') next.delete('tab');
    else next.set('tab', id);
    const query = next.toString();
    router.replace(query ? `/admin/trading-management?${query}` : '/admin/trading-management');
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      await overview.mutate();
      if (tab === 'audit') await audit.mutate();
    } catch (error) {
      setNotice(messageOf(error));
      throw error;
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) return <ForbiddenNotice permission="trading.schedule.view" />;

  const data = overview.data;
  const openSession = data?.today.sessions.find((session) => session.status === 'فعال') ?? data?.today.sessions[0];

  const saveSession = async (body: TradingSessionBody, sessionId?: string) => {
    await run(async () => {
      if (draft?.mode === 'limits' && sessionId) {
        await tradingApi.upsertLimit({ ...body, sessionId, scope: 'GLOBAL', enabled: true });
      } else if (sessionId) {
        await tradingApi.updateSession(sessionId, body);
      } else {
        await tradingApi.createSession(body);
      }
      setDraft(null);
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">مدیریت معاملات › برنامه معاملات</p>
        <PageHeader
          title="مدیریت زمان و محدودیت معاملات"
          description="تعریف بازه‌های زمانی، محدودیت‌ها و تعطیلات معاملات در سامانه"
        />
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted/70 p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'shrink-0 rounded-lg px-3 py-2 text-sm',
                tab === item.id ? 'bg-white font-medium text-gold-800 shadow-sm' : 'text-muted-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {notice ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{notice}</p> : null}
      {overview.isLoading ? <SkeletonBlock className="h-40" /> : null}
      {overview.error ? <ApiErrorState error={overview.error} onRetry={() => void overview.mutate()} /> : null}

      {data && tab === 'overview' ? (
        <Overview
          data={data}
          month={month}
          expanded={expanded ?? openSession?.id ?? null}
          onToggle={(id) => setExpanded((current) => (current === id ? null : id))}
          onMonth={(delta) => setMonth((current) => shiftMonth(current, delta))}
          onOpenSessions={() => setExpanded('all')}
          onWeekly={() => setTab('weekly')}
          onHolidays={() => setTab('holidays')}
          canSchedule={canSchedule}
          canHolidays={canHolidays}
          busy={busy}
          onEdit={(session) => setDraft({ mode: 'edit', session })}
          onToggleEnabled={(session) => {
            void run(() => tradingApi.updateSession(session.id, { enabled: !session.enabled }).then(() => undefined)).catch(() => undefined);
          }}
          onPickDate={(date, marker) => setOverrideOpen({ date, marker })}
        />
      ) : null}

      {data && tab === 'weekly' ? (
        <WeeklyPanel
          data={data}
          canSchedule={canSchedule}
          busy={busy}
          onCreate={(weekday) => setDraft({ mode: 'create', weekday })}
          onEdit={(session) => setDraft({ mode: 'edit', session })}
          onCopy={setCopySource}
          onDelete={setDeleteId}
          onToggleEnabled={(session) => {
            void run(() => tradingApi.updateSession(session.id, { enabled: !session.enabled }).then(() => undefined)).catch(() => undefined);
          }}
        />
      ) : null}

      {data && tab === 'limits' ? (
        <LimitsPanel
          data={data}
          canEdit={canLimits || canSchedule}
          onEdit={(session) => setDraft({ mode: canLimits && !canSchedule ? 'limits' : 'edit', session })}
        />
      ) : null}

      {data && (tab === 'holidays' || tab === 'exceptions') ? (
        <HolidaysPanel
          data={data}
          month={month}
          kind={tab === 'exceptions' ? 'SPECIAL_SCHEDULE' : 'FULL_CLOSURE'}
          canManage={canHolidays}
          onMonth={(delta) => setMonth((current) => shiftMonth(current, delta))}
          onPick={(date, marker) => setOverrideOpen({ date, marker })}
          onCreate={() => setOverrideOpen({ date: data.today.date, marker: null })}
        />
      ) : null}

      {tab === 'audit' ? (
        canAudit ? (
          <AuditPanel loading={audit.isLoading} error={audit.error} onRetry={() => void audit.mutate()} items={audit.data?.items ?? []} />
        ) : (
          <ForbiddenNotice permission="trading.audit.view" />
        )
      ) : null}

      <SessionDialog
        key={`${draft?.mode ?? 'closed'}-${draft?.session?.id ?? draft?.weekday ?? ''}`}
        draft={draft}
        busy={busy}
        onClose={() => setDraft(null)}
        onSubmit={saveSession}
      />
      <CopyDialog
        key={copySource?.id ?? 'copy'}
        session={copySource}
        busy={busy}
        onClose={() => setCopySource(null)}
        onSubmit={async (weekdays) => {
          if (!copySource) return;
          await run(async () => {
            await tradingApi.copySession(copySource.id, weekdays);
            setCopySource(null);
          });
        }}
      />
      <OverrideDialog
        key={`${overrideOpen?.marker?.id ?? 'new'}-${overrideOpen?.date ?? ''}`}
        open={overrideOpen != null}
        marker={overrideOpen?.marker ?? null}
        date={overrideOpen?.date ?? data?.today.date ?? range.from}
        busy={busy}
        onClose={() => setOverrideOpen(null)}
        onSubmit={async (body) => {
          await run(async () => {
            if (overrideOpen?.marker) await tradingApi.updateOverride(overrideOpen.marker.id, body);
            else await tradingApi.createOverride(body);
            setOverrideOpen(null);
          });
        }}
        onDelete={async () => {
          const marker = overrideOpen?.marker;
          if (!marker) return;
          await run(async () => {
            await tradingApi.deleteOverride(marker.id);
            setOverrideOpen(null);
          });
        }}
      />
      <ConfirmDialog
        open={deleteId != null}
        title="حذف بازه"
        message="این بازه از برنامه حذف می‌شود. تغییر در تاریخچه ثبت خواهد شد."
        confirmLabel="حذف"
        destructive
        isLoading={busy}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (!deleteId) return;
          void run(async () => {
            await tradingApi.deleteSession(deleteId);
            setDeleteId(null);
          }).catch(() => undefined);
        }}
      />
    </div>
  );
}
