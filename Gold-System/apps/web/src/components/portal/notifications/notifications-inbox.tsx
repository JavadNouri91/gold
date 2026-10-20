'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR, { useSWRConfig } from 'swr';
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Search,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import {
  notificationsApi,
  type Notification,
  type NotificationCategory,
  type NotificationReadFilter,
  type NotificationSort,
  type NotificationSummary,
} from '@/lib/api';
import { activityBounds, tehranCivilDate } from '@/lib/activity-range';
import { formatGrams, formatRial, toPersianDigits } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DatePickerJalali } from '@/components/ui/date-picker-jalali';
import {
  categoryLabel,
  entityActionLabel,
  groupByDay,
  itemVisual,
  listTimestamp,
  notificationListHref,
  notificationStamp,
  notificationTitle,
  relationActionLabel,
  relationNumberLabel,
  relationStatusLabel,
} from './catalog';
import { EMPTY_FILTERS, type DateRange, type InboxFilterValue, filtersAreClear } from './filter-fields';
import { InboxSheet } from './inbox-sheet';

const PAGE_SIZE = 20;

function filterBounds(filters: InboxFilterValue, now = new Date()) {
  if (filters.range === 'all') return { from: undefined as string | undefined, to: undefined as string | undefined };
  if (filters.range === 'today') {
    const today = tehranCivilDate(now);
    return {
      from: `${today}T00:00:00.000+03:30`,
      to: `${today}T23:59:59.999+03:30`,
    };
  }
  if (filters.range === '7d' || filters.range === '30d') {
    return activityBounds(filters.range, { from: '', to: '' }, now) ?? undefined;
  }
  return activityBounds('custom', { from: filters.customFrom, to: filters.customTo }, now) ?? undefined;
}

function pageWindow(page: number, total: number): Array<number | 'gap'> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages: Array<number | 'gap'> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) pages.push('gap');
  for (let index = start; index <= end; index += 1) pages.push(index);
  if (end < total - 1) pages.push('gap');
  pages.push(total);
  return pages;
}

type SummaryCardKey = 'all' | 'unread' | 'trades' | 'financial';

function summaryCardKey(filters: InboxFilterValue): SummaryCardKey {
  if (filters.read === 'unread' && filters.category === '') return 'unread';
  if (filters.read === 'all' && filters.category === 'trades') return 'trades';
  if (filters.read === 'all' && filters.category === 'financial') return 'financial';
  if (filters.read === 'all' && filters.category === '') return 'all';
  return 'all';
}

function filtersForCard(key: SummaryCardKey): Pick<InboxFilterValue, 'read' | 'category'> {
  if (key === 'unread') return { read: 'unread', category: '' };
  if (key === 'trades') return { read: 'all', category: 'trades' };
  if (key === 'financial') return { read: 'all', category: 'financial' };
  return { read: 'all', category: '' };
}

function SummaryCards({
  summary,
  total,
  active,
  onSelect,
}: {
  summary?: NotificationSummary;
  total: number;
  active: SummaryCardKey;
  onSelect: (key: SummaryCardKey) => void;
}) {
  const cards: Array<{
    key: SummaryCardKey;
    label: string;
    value: number | undefined;
    unit: string;
    valueClass: string;
    iconWrap: string;
    icon: typeof Bell;
    accent?: boolean;
  }> = [
    {
      key: 'all',
      label: 'کل اعلان‌ها',
      value: summary ? total : undefined,
      unit: 'پیام',
      valueClass: 'text-slate-900',
      iconWrap: 'bg-amber-50 text-amber-600',
      icon: Bell,
    },
    {
      key: 'unread',
      label: 'خوانده نشده',
      value: summary?.unread,
      unit: 'پیام',
      valueClass: 'text-red-500',
      iconWrap: 'bg-red-50 text-red-500',
      icon: Bell,
      accent: true,
    },
    {
      key: 'trades',
      label: 'مربوط به سفارشات',
      value: summary?.trades,
      unit: 'پیام',
      valueClass: 'text-slate-900',
      iconWrap: 'bg-emerald-50 text-emerald-600',
      icon: ShoppingCart,
    },
    {
      key: 'financial',
      label: 'مربوط به مالی/واریزی',
      value: summary?.financial,
      unit: 'پیام',
      valueClass: 'text-emerald-600',
      iconWrap: 'bg-emerald-50 text-emerald-600',
      icon: Wallet,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const selected = active === card.key;
        return (
          <button
            key={card.key}
            type="button"
            onClick={() => onSelect(card.key)}
            aria-pressed={selected}
            className={`rounded-2xl border bg-white p-4 text-start shadow-sm transition hover:bg-slate-50 ${
              selected
                ? 'border-amber-300 ring-2 ring-amber-200'
                : card.accent
                  ? 'border-red-100'
                  : 'border-slate-100'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-slate-500">{card.label}</p>
                <p className={`mt-2 text-3xl font-bold ${card.valueClass}`}>
                  {card.value == null ? '…' : toPersianDigits(String(card.value))}
                  <span className="ms-1 text-sm font-medium text-slate-400">{card.unit}</span>
                </p>
              </div>
              <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${card.iconWrap}`}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-4" aria-hidden>
      <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-slate-100" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-4 w-2/5 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-28 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="relative min-w-[9.5rem] flex-1">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pe-8 text-sm text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        {options.map((option) => (
          <option key={option.value || 'all'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NotificationsInbox() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<InboxFilterValue>(EMPTY_FILTERS);
  const [sort, setSort] = useState<NotificationSort>('newest');
  const [page, setPage] = useState(1);
  const [stacked, setStacked] = useState<Notification[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const appendRef = useRef(false);
  const { mutate: mutateKeys } = useSWRConfig();

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const bounds = useMemo(() => filterBounds(filters), [filters]);
  const boundsKey = bounds ? `${bounds.from ?? ''}|${bounds.to ?? ''}` : 'pending';

  useEffect(() => {
    appendRef.current = false;
    setPage(1);
    setSelected(new Set());
    setStacked([]);
  }, [query, filters.read, filters.category, boundsKey, sort]);

  const summary = useSWR('notifications/summary', () => notificationsApi.summary(), {
    revalidateOnFocus: true,
  });

  const list = useSWR(
    bounds
      ? ['notifications/inbox', page, query, filters.read, filters.category, boundsKey, sort]
      : null,
    () =>
      notificationsApi.list({
        page,
        limit: PAGE_SIZE,
        read: filters.read,
        category: filters.category || undefined,
        q: query || undefined,
        from: bounds?.from,
        to: bounds?.to,
        sort,
      }),
  );

  useEffect(() => {
    if (!list.data) return;
    if (appendRef.current) {
      const incoming = list.data.items;
      setStacked((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...incoming.filter((item) => !seen.has(item.id))];
      });
      appendRef.current = false;
      return;
    }
    setStacked(list.data.items);
  }, [list.data]);

  const detail = useSWR(openId ? ['notification', openId] : null, () =>
    notificationsApi.getById(openId as string),
  );

  const total = list.data?.meta.total ?? 0;
  const totalPages = list.data?.meta.totalPages ?? 0;
  const groups = groupByDay(stacked);
  const openItem = stacked.find((item) => item.id === openId) ?? null;
  const hasFilters = !filtersAreClear(filters, query);
  const allCount =
    (summary.data?.trades ?? 0) +
    (summary.data?.financial ?? 0) +
    (summary.data?.kyc ?? 0) +
    (summary.data?.account ?? 0);

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function markIds(ids: string[]) {
    const unreadIds = ids.filter((id) => stacked.some((item) => item.id === id && !item.readAt));
    if (unreadIds.length === 0) return;
    const snapshot = stacked;
    const summarySnapshot = summary.data;
    const now = new Date().toISOString();
    setStacked((items) =>
      filters.read === 'unread'
        ? items.filter((item) => !unreadIds.includes(item.id))
        : items.map((item) => (unreadIds.includes(item.id) ? { ...item, readAt: now } : item)),
    );
    if (summary.data) {
      await summary.mutate(
        { ...summary.data, unread: Math.max(0, summary.data.unread - unreadIds.length) },
        { revalidate: false },
      );
    }
    setBusy(true);
    try {
      if (unreadIds.length === 1) await notificationsApi.markRead(unreadIds[0]);
      else await notificationsApi.markReadIds(unreadIds);
      await summary.mutate();
      if (filters.read === 'unread') await list.mutate();
      await mutateKeys((key) => Array.isArray(key) && key[0] === 'notification');
      setSelected(new Set());
    } catch {
      setStacked(snapshot);
      if (summarySnapshot) await summary.mutate(summarySnapshot, { revalidate: false });
    } finally {
      setBusy(false);
    }
  }

  async function markEverything() {
    const snapshot = stacked;
    const summarySnapshot = summary.data;
    const now = new Date().toISOString();
    setStacked((items) =>
      filters.read === 'unread' ? [] : items.map((item) => ({ ...item, readAt: item.readAt ?? now })),
    );
    if (summary.data) {
      await summary.mutate({ ...summary.data, unread: 0 }, { revalidate: false });
    }
    setBusy(true);
    try {
      await notificationsApi.markAllRead();
      await Promise.all([summary.mutate(), list.mutate()]);
      setSelected(new Set());
    } catch {
      setStacked(snapshot);
      if (summarySnapshot) await summary.mutate(summarySnapshot, { revalidate: false });
    } finally {
      setBusy(false);
    }
  }

  function openNotification(item: Notification) {
    setOpenId(item.id);
    void markIds([item.id]);
  }

  const visibleIds = stacked.map((item) => item.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);
  const customPending = filters.range === 'custom' && !bounds;
  const unreadCount = summary.data?.unread ?? 0;

  return (
    <div className="min-w-0 space-y-5" dir="rtl">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">اعلان‌های من</h1>
          <p className="mt-1 text-sm text-slate-500">
            مشاهده و مدیریت تمام اعلان‌ها، وضعیت معاملات، پرداخت‌ها و پیام‌های مهم سامانه
          </p>
        </div>
        <button
          type="button"
          disabled={busy || unreadCount === 0}
          onClick={() => void markEverything()}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
        >
          <Check className="h-4 w-4" aria-hidden />
          علامت‌گذاری همه به عنوان خوانده شده
        </button>
      </header>

      <SummaryCards
        summary={summary.data}
        total={allCount}
        active={summaryCardKey(filters)}
        onSelect={(key) => {
          const next = filtersForCard(key);
          setFilters((current) => ({ ...current, ...next }));
        }}
      />

      <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1 lg:max-w-sm">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="جستجو در میان اعلان‌ها..."
              aria-label="جستجو در اعلان‌ها"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/80 pe-10 ps-3 text-sm text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            />
          </label>
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            <FilterSelect
              label="نوع اعلان"
              value={filters.category}
              onChange={(category) =>
                setFilters((current) => ({ ...current, category: category as NotificationCategory | '' }))
              }
              options={[
                { value: '', label: 'نوع اعلان' },
                { value: 'trades', label: 'سفارشات و معاملات' },
                { value: 'financial', label: 'مالی و واریزی' },
                { value: 'kyc', label: 'احراز هویت' },
                { value: 'account', label: 'حساب' },
              ]}
            />
            <FilterSelect
              label="وضعیت"
              value={filters.read}
              onChange={(read) =>
                setFilters((current) => ({ ...current, read: read as NotificationReadFilter }))
              }
              options={[
                { value: 'all', label: 'وضعیت (خوانده‌شده/نشده)' },
                { value: 'unread', label: 'خوانده نشده' },
                { value: 'read', label: 'خوانده شده' },
              ]}
            />
            <FilterSelect
              label="بازه زمانی"
              value={filters.range}
              onChange={(range) =>
                setFilters((current) => ({ ...current, range: range as DateRange }))
              }
              options={[
                { value: 'all', label: 'بازه زمانی' },
                { value: 'today', label: 'امروز' },
                { value: '7d', label: '۷ روز اخیر' },
                { value: '30d', label: '۳۰ روز اخیر' },
                { value: 'custom', label: 'سفارشی' },
              ]}
            />
            <select
              aria-label="مرتب‌سازی"
              value={sort}
              onChange={(event) => setSort(event.target.value as NotificationSort)}
              className="h-11 min-w-[8rem] flex-1 appearance-none rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-amber-400 lg:max-w-[9rem]"
            >
              <option value="newest">جدیدترین</option>
              <option value="oldest">قدیمی‌ترین</option>
            </select>
          </div>
        </div>
        {filters.range === 'custom' ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <DatePickerJalali
              label="از تاریخ"
              value={filters.customFrom}
              onChange={(customFrom) => setFilters((current) => ({ ...current, customFrom }))}
            />
            <DatePickerJalali
              label="تا تاریخ"
              value={filters.customTo}
              onChange={(customTo) => setFilters((current) => ({ ...current, customTo }))}
            />
          </div>
        ) : null}
        {selected.size > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => void markIds([...selected])}>
              علامت‌گذاری انتخاب‌ها به‌عنوان خوانده‌شده
            </Button>
            <button
              type="button"
              className="h-11 text-sm text-slate-500"
              onClick={() => setSelected(allSelected ? new Set() : new Set(visibleIds))}
            >
              {allSelected ? 'لغو انتخاب همه' : 'انتخاب همه در این صفحه'}
            </button>
          </div>
        ) : null}
      </div>

      <section className="min-w-0 space-y-3">
        {list.error ? (
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-10 text-center" role="alert">
            <p className="font-medium text-slate-900">اعلان‌ها در حال حاضر قابل دریافت نیستند.</p>
            <Button type="button" className="mt-4" onClick={() => void list.mutate()}>
              تلاش مجدد
            </Button>
          </div>
        ) : list.isLoading && stacked.length === 0 ? (
          <div className="space-y-3" aria-busy="true" aria-label="در حال بارگذاری اعلان‌ها">
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </div>
        ) : stacked.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-12 text-center">
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50">
              <Bell className="h-6 w-6 text-amber-600" aria-hidden />
            </span>
            <p className="mt-4 font-semibold text-slate-900">
              {hasFilters ? 'اعلانی با این فیلترها پیدا نشد.' : 'اعلانی برای نمایش وجود ندارد.'}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-slate-500">
              {hasFilters
                ? 'فیلترها یا عبارت جستجو را تغییر دهید.'
                : 'وقتی رویداد مهمی در حساب، معاملات یا پرداخت‌های شما اتفاق بیفتد، اعلان آن را در اینجا مشاهده خواهید کرد.'}
            </p>
            {hasFilters ? (
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setFilters(EMPTY_FILTERS);
                  setSearch('');
                  setQuery('');
                }}
              >
                پاک کردن فیلترها
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-6">
            {customPending ? (
              <p className="text-sm text-slate-500">برای بازه سفارشی، هر دو تاریخ را انتخاب کنید.</p>
            ) : null}
            {groups.map((group) => (
              <section key={group.key} className="space-y-2">
                <h2 className="text-sm font-semibold text-slate-400">{group.label}</h2>
                <ul className="space-y-2">
                  {group.items.map((item) => {
                    const unread = !item.readAt;
                    const visual = itemVisual(item.type);
                    const Icon = visual.icon;
                    const title = notificationTitle(item);
                    const href = notificationListHref(item);
                    const action = entityActionLabel(item.relatedEntityType);
                    return (
                      <li key={item.id}>
                        <article
                          className={`flex items-stretch gap-2 rounded-2xl border p-3 shadow-sm transition ${
                            unread
                              ? 'border-sky-100 bg-gradient-to-l from-sky-50 via-white to-amber-50/80'
                              : 'border-slate-100 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <label className="flex h-11 w-10 shrink-0 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={selected.has(item.id)}
                              onChange={() => toggleSelected(item.id)}
                              aria-label={`انتخاب ${title}`}
                              className="h-4 w-4 accent-amber-500"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => openNotification(item)}
                            className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-xl px-1 py-1 text-start"
                          >
                            <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${visual.tile}`}>
                              <Icon className={`h-5 w-5 ${visual.iconColor}`} aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-start justify-between gap-3">
                                <span className={`text-sm text-slate-900 ${unread ? 'font-bold' : 'font-semibold'}`}>
                                  {toPersianDigits(title)}
                                </span>
                                <span className="shrink-0 text-xs text-slate-400">{listTimestamp(item.createdAt)}</span>
                              </span>
                              <span className="sr-only">{unread ? 'خوانده نشده' : 'خوانده شده'}</span>
                              <span className="mt-1 line-clamp-2 block text-sm leading-6 text-slate-500">
                                {toPersianDigits(item.body)}
                              </span>
                            </span>
                          </button>
                          <div className="flex shrink-0 flex-col items-end justify-between gap-2 ps-1">
                            {unread ? (
                              <span className="flex items-center gap-1" aria-hidden>
                                <span className="h-2 w-2 rounded-full bg-blue-500" />
                                <span className="h-2 w-2 rounded-full bg-red-400" />
                              </span>
                            ) : (
                              <span className="h-2 w-2" />
                            )}
                            {href ? (
                              <Link
                                href={href}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-white/80 hover:text-slate-800"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {action}
                                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                              </Link>
                            ) : (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-white/80"
                                onClick={() => openNotification(item)}
                              >
                                جزئیات
                                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            )}
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <>
            <div className="hidden items-center justify-between gap-3 pt-2 lg:flex">
              <p className="text-sm text-slate-500">
                نمایش {toPersianDigits(String(rangeStart))} تا {toPersianDigits(String(rangeEnd))} از{' '}
                {toPersianDigits(String(total))} اعلان
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="صفحه قبل"
                  disabled={page <= 1}
                  onClick={() => {
                    appendRef.current = false;
                    setStacked([]);
                    setPage((current) => Math.max(1, current - 1));
                  }}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                {pageWindow(page, totalPages).map((entry, index) =>
                  entry === 'gap' ? (
                    <span key={`gap-${index}`} className="px-1 text-slate-400">
                      …
                    </span>
                  ) : (
                    <button
                      key={entry}
                      type="button"
                      aria-label={`صفحه ${toPersianDigits(String(entry))}`}
                      aria-current={entry === page ? 'page' : undefined}
                      onClick={() => {
                        appendRef.current = false;
                        setStacked([]);
                        setPage(entry);
                      }}
                      className={`inline-flex h-11 min-w-11 items-center justify-center rounded-xl border px-2 text-sm ${
                        entry === page
                          ? 'border-amber-400 bg-amber-50 font-semibold text-slate-900'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      {toPersianDigits(String(entry))}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  aria-label="صفحه بعد"
                  disabled={page >= totalPages}
                  onClick={() => {
                    appendRef.current = false;
                    setStacked([]);
                    setPage((current) => current + 1);
                  }}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            </div>
            {page < totalPages ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full lg:hidden"
                onClick={() => {
                  appendRef.current = true;
                  setPage((current) => current + 1);
                }}
              >
                مشاهده اعلان‌های بیشتر
              </Button>
            ) : null}
          </>
        ) : null}
      </section>

      <InboxSheet
        open={openId != null}
        title={notificationTitle(detail.data ?? openItem ?? { type: '', subject: null })}
        onClose={() => setOpenId(null)}
      >
        {detail.error ? (
          <div role="alert">
            <p className="text-sm text-slate-900">اعلان‌ها در حال حاضر قابل دریافت نیستند.</p>
            <Button type="button" className="mt-4" onClick={() => void detail.mutate()}>
              تلاش مجدد
            </Button>
          </div>
        ) : (
          <DetailBody
            item={shownNotification(detail.data, openItem)}
            loading={detail.isLoading && !detail.data && !openItem}
          />
        )}
      </InboxSheet>
    </div>
  );
}

function shownNotification(
  remote: (Notification & { relation?: import('@/lib/api').NotificationDetail['relation'] }) | undefined,
  local: Notification | null,
): (Notification & { relation?: import('@/lib/api').NotificationDetail['relation'] }) | null {
  const base = remote ?? local;
  if (!base) return null;
  return {
    ...base,
    ...(remote ?? {}),
    readAt: local?.readAt || remote?.readAt || null,
    relation: remote && 'relation' in remote ? remote.relation : null,
  };
}

function DetailBody({
  item,
  loading,
}: {
  item: (Notification & { relation?: import('@/lib/api').NotificationDetail['relation'] }) | null;
  loading: boolean;
}) {
  if (loading || !item) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
        <div className="h-16 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }
  const relation = 'relation' in item ? item.relation : null;
  const unread = !item.readAt;
  return (
    <div className="space-y-4 text-sm">
      <p className="text-slate-500">نوع اعلان: {categoryLabel(item.type)}</p>
      <p className="whitespace-pre-wrap leading-7 text-slate-900">{toPersianDigits(item.body)}</p>
      <p className="text-xs text-slate-500">{notificationStamp(item.createdAt)}</p>
      <p className="text-xs text-slate-500">{unread ? 'خوانده نشده' : 'خوانده شده'}</p>
      {relation ? (
        <dl className="space-y-2 rounded-xl border border-slate-200 p-3">
          {relation.number ? (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{relationNumberLabel(relation.kind)}</dt>
              <dd className="font-medium text-slate-900" dir="ltr">
                {toPersianDigits(relation.number)}
              </dd>
            </div>
          ) : null}
          {relation.amountRial ? (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">مبلغ</dt>
              <dd className="font-medium text-slate-900">{formatRial(relation.amountRial)}</dd>
            </div>
          ) : null}
          {relation.weightGrams ? (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">وزن</dt>
              <dd className="font-medium text-slate-900">{formatGrams(relation.weightGrams)}</dd>
            </div>
          ) : null}
          {relation.referenceNumber ? (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">شماره پیگیری</dt>
              <dd className="font-medium text-slate-900" dir="ltr">
                {toPersianDigits(relation.referenceNumber)}
              </dd>
            </div>
          ) : null}
          {relation.status ? (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">وضعیت</dt>
              <dd className="font-medium text-slate-900">{relationStatusLabel(relation)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {relation ? (
        <Link
          href={relation.href}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-500 px-4 text-sm font-medium text-white"
        >
          {relationActionLabel(relation.kind)}
        </Link>
      ) : null}
    </div>
  );
}
