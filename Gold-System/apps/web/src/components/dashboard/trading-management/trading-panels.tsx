'use client';

import { jalaaliMonthLength, toGregorian } from 'jalaali-js';
import { ChevronLeft, ChevronRight, Copy, Plus, Scale, Trash2 } from 'lucide-react';
import { ApiErrorState, SkeletonBlock } from '@/components/dashboard/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TradingMarker, TradingOverview, TradingSessionView } from '@/lib/internal-api';
import { cn, formatDateTime, formatMobile, toPersianDigits } from '@/lib/utils';
import {
  Meter,
  Ring,
  SessionCard,
  WEEKDAYS,
  clock,
  countText,
  grams,
  meterLabel,
  money,
} from './trading-widgets';

const MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

function iso(gy: number, gm: number, gd: number): string {
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

export function shiftMonth(current: { jy: number; jm: number }, delta: number) {
  const next = current.jm + delta;
  if (next < 1) return { jy: current.jy - 1, jm: 12 };
  if (next > 12) return { jy: current.jy + 1, jm: 1 };
  return { jy: current.jy, jm: next };
}

export function Overview({
  data,
  month,
  expanded,
  onToggle,
  onMonth,
  onOpenSessions,
  onWeekly,
  onHolidays,
  canSchedule,
  canHolidays,
  busy,
  onEdit,
  onToggleEnabled,
  onPickDate,
}: {
  data: TradingOverview;
  month: { jy: number; jm: number };
  expanded: string | null;
  onToggle: (id: string) => void;
  onMonth: (delta: number) => void;
  onOpenSessions: () => void;
  onWeekly: () => void;
  onHolidays: () => void;
  canSchedule: boolean;
  canHolidays: boolean;
  busy: boolean;
  onEdit: (session: TradingSessionView) => void;
  onToggleEnabled: (session: TradingSessionView) => void;
  onPickDate: (date: string, marker: TradingMarker | null) => void;
}) {
  const windowText = data.currentLimits
    ? `${clock(data.currentLimits.startTime)} تا ${clock(data.currentLimits.endTime)}`
    : data.holidayTitle ?? (data.scheduleEnabled ? 'بازه‌ای در حال اجرا نیست' : 'برنامه معاملات غیرفعال است');

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="وضعیت فعلی"
          value={data.status}
          hint={windowText}
          icon={<Scale className="h-5 w-5 text-green-600" />}
          active={data.status === 'فعال'}
        />
        <SummaryCard title="تعداد معاملات امروز" value={countText(data.summary.count.used)} hint={meterLabel(data.summary.count, 'count')} percent={data.summary.count.percent} tone="blue" />
        <SummaryCard title="وزن معاملات امروز" value={grams(String(data.summary.weight.used))} hint={meterLabel(data.summary.weight, 'weight')} percent={data.summary.weight.percent} tone="gold" />
        <SummaryCard title="حجم معاملات امروز" value={money(String(data.summary.amount.used))} hint={meterLabel(data.summary.amount, 'money')} percent={data.summary.amount.percent} tone="green" />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">برنامه معاملات امروز</CardTitle>
            <p className="text-xs text-muted-foreground">{data.today.weekdayLabel}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.today.sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">برای امروز بازه‌ای تعریف نشده است.</p>
            ) : (
              data.today.sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  expanded={expanded === 'all' || expanded === session.id}
                  onToggle={() => onToggle(session.id)}
                  onEdit={() => onEdit(session)}
                  onToggleEnabled={() => onToggleEnabled(session)}
                  canEdit={canSchedule}
                  busy={busy}
                />
              ))
            )}
            <Button type="button" variant="ghost" size="sm" onClick={onOpenSessions}>
              مشاهده جزئیات تمام بازه‌های امروز
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">برنامه هفتگی معاملات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[280px] text-right text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 font-medium">روز هفته</th>
                    <th className="px-2 py-2 font-medium">بازه‌های زمانی</th>
                    <th className="px-2 py-2 font-medium">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weekly.map((day) => (
                    <tr key={day.weekday} className={cn('border-t', day.weekday === data.today.weekday && 'bg-blue-50/70')}>
                      <td className="px-2 py-2">{day.label}</td>
                      <td className="px-2 py-2" dir="ltr">
                        {day.sessions.length === 0
                          ? '—'
                          : day.sessions.map((session) => (
                              <div key={session.id}>{clock(session.startTime)} – {clock(session.endTime)}</div>
                            ))}
                      </td>
                      <td className="px-2 py-2">
                        {day.sessions.some((session) => session.enabled) ? (
                          <DayBadge tone="green">فعال</DayBadge>
                        ) : (
                          <DayBadge>{day.sessions.length === 0 ? 'بدون بازه' : 'غیرفعال'}</DayBadge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={onWeekly}>
              ویرایش برنامه هفتگی
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">تقویم تعطیلات و استثنائات</CardTitle>
            <MonthArrows label={`${MONTHS[month.jm - 1]} ${toPersianDigits(String(month.jy))}`} onMonth={onMonth} />
          </CardHeader>
          <CardContent>
            <MonthGrid jy={month.jy} jm={month.jm} today={data.today.date} markers={data.markers} onPick={canHolidays ? onPickDate : undefined} />
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={onHolidays}>
              مدیریت تعطیلات و استثنائات
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">محدودیت‌های بازه جاری</CardTitle>
          <p className="text-xs text-muted-foreground">
            {data.currentLimits
              ? `${data.currentLimits.title}، ${clock(data.currentLimits.startTime)} تا ${clock(data.currentLimits.endTime)}`
              : 'بازه‌ای در حال اجرا نیست.'}
          </p>
        </CardHeader>
        <CardContent>
          {data.currentLimits ? (
            <div className="grid gap-4 md:grid-cols-3">
              <LimitBlock label="سقف ریالی" meter={data.currentLimits.amount} kind="money" color="#22c55e" />
              <LimitBlock label="سقف وزن طلا" meter={data.currentLimits.weight} kind="weight" color="#d4a017" />
              <LimitBlock label="سقف تعداد معاملات" meter={data.currentLimits.count} kind="count" color="#3b82f6" />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  hint,
  percent,
  tone = 'green',
  icon,
  active,
}: {
  title: string;
  value: string;
  hint: string;
  percent?: number | null;
  tone?: 'green' | 'gold' | 'blue';
  icon?: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Card className={active ? 'border-green-200 bg-green-50/40' : undefined}>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{title}</p>
          {icon}
        </div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
        {percent !== undefined ? <Meter percent={percent} tone={tone} /> : null}
      </CardContent>
    </Card>
  );
}

function DayBadge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'green' | 'muted' }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', tone === 'green' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600')}>
      {children}
    </span>
  );
}

function LimitBlock({
  label,
  meter,
  kind,
  color,
}: {
  label: string;
  meter: TradingOverview['summary']['amount'];
  kind: 'money' | 'weight' | 'count';
  color: string;
}) {
  const format =
    kind === 'money'
      ? (value: string | number | null | undefined) => money(value == null ? null : String(value))
      : kind === 'weight'
        ? (value: string | number | null | undefined) => grams(value == null ? null : String(value))
        : (value: string | number | null | undefined) => countText(value);
  return (
    <div className="flex items-center gap-4 rounded-xl border p-3">
      <Ring percent={meter.percent} color={color} label={label} />
      <div className="text-sm">
        <p className="font-medium">{label}</p>
        <p className="mt-1 text-muted-foreground">سقف: {format(meter.max)}</p>
        <p className="text-muted-foreground">مصرف‌شده: {format(meter.used)}</p>
        <p className="text-muted-foreground">باقی‌مانده: {format(meter.remaining)}</p>
      </div>
    </div>
  );
}

function MonthArrows({ label, onMonth }: { label: string; onMonth: (delta: number) => void }) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <button type="button" aria-label="ماه قبل" onClick={() => onMonth(-1)} className="rounded p-1 hover:bg-muted">
        <ChevronRight className="h-4 w-4" />
      </button>
      <span>{label}</span>
      <button type="button" aria-label="ماه بعد" onClick={() => onMonth(1)} className="rounded p-1 hover:bg-muted">
        <ChevronLeft className="h-4 w-4" />
      </button>
    </div>
  );
}

export function MonthGrid({
  jy,
  jm,
  today,
  markers,
  onPick,
}: {
  jy: number;
  jm: number;
  today: string;
  markers: TradingMarker[];
  onPick?: (date: string, marker: TradingMarker | null) => void;
}) {
  const first = toGregorian(jy, jm, 1);
  const jsDay = new Date(Date.UTC(first.gy, first.gm - 1, first.gd)).getUTCDay();
  const offset = (jsDay + 1) % 7;
  const days = jalaaliMonthLength(jy, jm);
  const cells: Array<{ day: number; date: string } | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: days }, (_, index) => {
      const day = index + 1;
      const gregorian = toGregorian(jy, jm, day);
      return { day, date: iso(gregorian.gy, gregorian.gm, gregorian.gd) };
    }),
  ];

  return (
    <div>
      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
        {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((label) => (
          <div key={label} className="py-1">{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {cells.map((cell, index) => {
          if (!cell) return <div key={`blank-${index}`} />;
          const marker = markers.find((item) => item.date === cell.date);
          const visible = marker?.enabled ? marker : null;
          const isToday = cell.date === today;
          return (
            <button
              key={cell.date}
              type="button"
              disabled={!onPick}
              onClick={() => onPick?.(cell.date, marker ?? null)}
              className={cn(
                'rounded-md py-1.5',
                visible?.kind === 'FULL_CLOSURE' && 'bg-red-100 text-red-700',
                visible?.kind === 'SPECIAL_SCHEDULE' && 'bg-blue-100 text-blue-800',
                isToday && 'ring-2 ring-gold-500',
                !visible && 'hover:bg-muted',
              )}
            >
              {toPersianDigits(String(cell.day))}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span>روز عادی</span>
        <span className="text-red-600">تعطیل</span>
        <span className="text-blue-700">برنامه اختصاصی</span>
        <span className="text-gold-700">امروز</span>
      </div>
    </div>
  );
}

export function WeeklyPanel({
  data,
  canSchedule,
  busy,
  onCreate,
  onEdit,
  onCopy,
  onDelete,
  onToggleEnabled,
}: {
  data: TradingOverview;
  canSchedule: boolean;
  busy: boolean;
  onCreate: (weekday: string) => void;
  onEdit: (session: TradingSessionView) => void;
  onCopy: (session: TradingSessionView) => void;
  onDelete: (id: string) => void;
  onToggleEnabled: (session: TradingSessionView) => void;
}) {
  return (
    <div className="space-y-3">
      {WEEKDAYS.map((day) => {
        const row = data.weekly.find((item) => item.weekday === day.id);
        const sessions = row?.sessions ?? [];
        return (
          <Card key={day.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
              <CardTitle className="text-base">{day.label}</CardTitle>
              {canSchedule ? (
                <Button type="button" size="sm" variant="outline" onClick={() => onCreate(day.id)}>
                  <Plus className="ms-1 h-3.5 w-3.5" />
                  افزودن بازه
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">بازه‌ای ثبت نشده است.</p>
              ) : (
                <table className="w-full min-w-[680px] text-right text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 font-medium">عنوان</th>
                      <th className="px-2 py-2 font-medium">ساعت</th>
                      <th className="px-2 py-2 font-medium">سقف ریالی</th>
                      <th className="px-2 py-2 font-medium">سقف وزن</th>
                      <th className="px-2 py-2 font-medium">وضعیت</th>
                      <th className="px-2 py-2 font-medium">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr key={session.id} className="border-t">
                        <td className="px-2 py-2">{session.title}</td>
                        <td className="px-2 py-2" dir="ltr">{clock(session.startTime)} – {clock(session.endTime)}</td>
                        <td className="px-2 py-2">{money(session.maxAmountRial)}</td>
                        <td className="px-2 py-2">{grams(session.maxWeightGrams)}</td>
                        <td className="px-2 py-2">{session.enabled ? 'فعال' : 'غیرفعال'}</td>
                        <td className="px-2 py-2">
                          {canSchedule ? (
                            <div className="flex flex-wrap gap-1">
                              <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(session)} disabled={busy}>ویرایش</Button>
                              <Button type="button" size="sm" variant="ghost" aria-label="کپی" onClick={() => onCopy(session)} disabled={busy}>
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => onToggleEnabled(session)} disabled={busy}>
                                {session.enabled ? 'غیرفعال' : 'فعال'}
                              </Button>
                              <Button type="button" size="sm" variant="ghost" aria-label="حذف" onClick={() => onDelete(session.id)} disabled={busy}>
                                <Trash2 className="h-3.5 w-3.5 text-red-600" />
                              </Button>
                            </div>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function LimitsPanel({
  data,
  canEdit,
  onEdit,
}: {
  data: TradingOverview;
  canEdit: boolean;
  onEdit: (session: TradingSessionView) => void;
}) {
  const sessions = data.weekly.flatMap((day) => day.sessions.map((session) => ({ ...session, day: day.label })));
  return (
    <div className="space-y-4">
      {data.currentLimits ? (
        <div className="grid gap-4 md:grid-cols-3">
          <LimitBlock label="سقف تعداد معاملات" meter={data.currentLimits.count} kind="count" color="#3b82f6" />
          <LimitBlock label="سقف وزن طلا" meter={data.currentLimits.weight} kind="weight" color="#d4a017" />
          <LimitBlock label="سقف ریالی" meter={data.currentLimits.amount} kind="money" color="#22c55e" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">بازه‌ای در حال اجرا نیست. سقف‌ها روی بازه‌های هفتگی تنظیم می‌شوند.</p>
      )}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-right text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-medium">روز</th>
                <th className="px-3 py-3 font-medium">بازه</th>
                <th className="px-3 py-3 font-medium">تعداد</th>
                <th className="px-3 py-3 font-medium">وزن</th>
                <th className="px-3 py-3 font-medium">مبلغ</th>
                <th className="px-3 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td className="px-3 py-6 text-muted-foreground" colSpan={6}>بازه‌ای برای تنظیم محدودیت وجود ندارد.</td></tr>
              ) : (
                sessions.map((session) => (
                  <tr key={session.id} className="border-t">
                    <td className="px-3 py-2">{session.day}</td>
                    <td className="px-3 py-2">{session.title}</td>
                    <td className="px-3 py-2">{countText(session.maxCount)}</td>
                    <td className="px-3 py-2">{grams(session.maxWeightGrams)}</td>
                    <td className="px-3 py-2">{money(session.maxAmountRial)}</td>
                    <td className="px-3 py-2">
                      {canEdit ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => onEdit(session)}>تنظیم سقف</Button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

export function HolidaysPanel({
  data,
  month,
  kind,
  canManage,
  onMonth,
  onPick,
  onCreate,
}: {
  data: TradingOverview;
  month: { jy: number; jm: number };
  kind: 'FULL_CLOSURE' | 'SPECIAL_SCHEDULE';
  canManage: boolean;
  onMonth: (delta: number) => void;
  onPick: (date: string, marker: TradingMarker | null) => void;
  onCreate: () => void;
}) {
  const rows = data.markers.filter((marker) => marker.kind === kind);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{kind === 'FULL_CLOSURE' ? 'تقویم تعطیلات' : 'استثنائات روزانه'}</CardTitle>
          {canManage ? (
            <Button type="button" size="sm" onClick={onCreate}>
              <Plus className="ms-1 h-3.5 w-3.5" />
              مورد جدید
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">در این ماه موردی ثبت نشده است.</p>
          ) : (
            <table className="w-full min-w-[520px] text-right text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">تاریخ</th>
                  <th className="px-2 py-2 font-medium">عنوان</th>
                  <th className="px-2 py-2 font-medium">جزئیات</th>
                  <th className="px-2 py-2 font-medium">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((marker) => (
                  <tr key={marker.id} className="border-t">
                    <td className="px-2 py-2">{toPersianDigits(marker.date)}</td>
                    <td className="px-2 py-2">{marker.title}</td>
                    <td className="px-2 py-2">
                      {marker.kind === 'FULL_CLOSURE'
                        ? 'تعطیلی کامل'
                        : marker.sessions.map((session) => `${clock(session.startTime)} تا ${clock(session.endTime)}`).join('، ') || 'برنامه اختصاصی'}
                    </td>
                    <td className="px-2 py-2">
                      <button type="button" className="text-gold-700" disabled={!canManage} onClick={() => onPick(marker.date, marker)}>
                        {marker.enabled ? 'فعال' : 'غیرفعال'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{MONTHS[month.jm - 1]}</CardTitle>
          <MonthArrows label="" onMonth={onMonth} />
        </CardHeader>
        <CardContent>
          <MonthGrid jy={month.jy} jm={month.jm} today={data.today.date} markers={data.markers} onPick={canManage ? onPick : undefined} />
        </CardContent>
      </Card>
    </div>
  );
}

export function AuditPanel({
  loading,
  error,
  onRetry,
  items,
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  items: Array<{
    id: string;
    actorName: string | null;
    actorMobile: string | null;
    action: string;
    entityType: string;
    before: unknown;
    after: unknown;
    timestamp: string;
  }>;
}) {
  if (loading) return <SkeletonBlock className="h-40" />;
  if (error) return <ApiErrorState error={error} onRetry={onRetry} />;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">تاریخچه تغییرات</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-right text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">زمان</th>
              <th className="px-3 py-3 font-medium">کاربر</th>
              <th className="px-3 py-3 font-medium">عمل</th>
              <th className="px-3 py-3 font-medium">موجودیت</th>
              <th className="px-3 py-3 font-medium">مقدار قبلی</th>
              <th className="px-3 py-3 font-medium">مقدار جدید</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td className="px-3 py-6 text-muted-foreground" colSpan={6}>تغییری ثبت نشده است.</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className="border-t align-top">
                <td className="whitespace-nowrap px-3 py-2">{formatDateTime(item.timestamp)}</td>
                <td className="px-3 py-2">
                  <div>{item.actorName ?? '—'}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{formatMobile(item.actorMobile)}</div>
                </td>
                <td className="px-3 py-2">{actionLabel(item.action)}</td>
                <td className="px-3 py-2">{entityLabel(item.entityType)}</td>
                <td className="px-3 py-2"><Snapshot value={item.before} /></td>
                <td className="px-3 py-2"><Snapshot value={item.after} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Snapshot({ value }: { value: unknown }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return <pre className="max-w-xs overflow-x-auto whitespace-pre-wrap text-[11px] leading-5" dir="ltr">{JSON.stringify(value)}</pre>;
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    TRADING_SESSION_CREATED: 'ایجاد بازه',
    TRADING_SESSION_UPDATED: 'ویرایش بازه',
    TRADING_SESSION_DELETED: 'حذف بازه',
    TRADING_SESSION_COPIED: 'کپی برنامه',
    TRADING_OVERRIDE_CREATED: 'ثبت استثنا',
    TRADING_OVERRIDE_UPDATED: 'ویرایش استثنا',
    TRADING_OVERRIDE_DELETED: 'حذف استثنا',
    TRADING_LIMIT_UPDATED: 'ویرایش محدودیت',
  };
  return labels[action] ?? action;
}

function entityLabel(entity: string): string {
  const labels: Record<string, string> = {
    TradingSession: 'بازه معاملاتی',
    TradingDayOverride: 'تعطیلی / استثنا',
    TradingLimit: 'محدودیت',
    TradingSchedule: 'برنامه معاملات',
  };
  return labels[entity] ?? entity;
}
