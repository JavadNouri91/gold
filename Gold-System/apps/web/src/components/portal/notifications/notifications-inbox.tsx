'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR, { useSWRConfig } from 'swr';
import { Bell, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import {
  notificationsApi,
  type Notification,
  type NotificationSort,
  type NotificationSummary,
} from '@/lib/api';
import { activityBounds, tehranCivilDate } from '@/lib/activity-range';
import { formatGrams, formatRial, toPersianDigits } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  CATEGORY_META,
  categoryLabel,
  categoryOf,
  entityActionLabel,
  groupByDay,
  notificationStamp,
  notificationTitle,
  relationActionLabel,
  relationNumberLabel,
  relationStatusLabel,
} from './catalog';
import {
  EMPTY_FILTERS,
  FilterFields,
  filtersAreClear,
  type InboxFilterValue,
} from './filter-fields';
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

function SummaryCards({ summary }: { summary?: NotificationSummary }) {
  const cards = [
    {
      key: 'unread',
      label: 'خوانده نشده',
      value: summary?.unread,
      tile: 'bg-red-50',
      iconColor: 'text-[#DC2626]',
      icon: Bell,
    },
    { key: 'trades', label: CATEGORY_META.trades.label, value: summary?.trades, tile: CATEGORY_META.trades.tile, iconColor: CATEGORY_META.trades.iconColor, icon: CATEGORY_META.trades.icon },
    { key: 'financial', label: CATEGORY_META.financial.label, value: summary?.financial, tile: CATEGORY_META.financial.tile, iconColor: CATEGORY_META.financial.iconColor, icon: CATEGORY_META.financial.icon },
    { key: 'kyc', label: CATEGORY_META.kyc.label, value: summary?.kyc, tile: CATEGORY_META.kyc.tile, iconColor: CATEGORY_META.kyc.iconColor, icon: CATEGORY_META.kyc.icon },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.key} className="rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${card.tile}`}>
                <Icon className={`h-4 w-4 ${card.iconColor}`} aria-hidden />
              </span>
              <p className="text-xs text-[#6B7280]">{card.label}</p>
            </div>
            <p className="mt-2 text-xl font-bold text-[#202124]">
              {card.value == null ? '…' : toPersianDigits(String(card.value))}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4" aria-hidden>
      <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-slate-100" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-4 w-2/5 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-28 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

export function NotificationsInbox() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<InboxFilterValue>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<InboxFilterValue>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sort, setSort] = useState<NotificationSort>('newest');
  const [page, setPage] = useState(1);
  const [stacked, setStacked] = useState<Notification[]>([]);
  const [selecting, setSelecting] = useState(false);
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

  function applyReadCategory(read: InboxFilterValue['read'], category: InboxFilterValue['category']) {
    setFilters((current) => ({ ...current, read, category }));
  }

  const tabs: { id: string; label: string; count?: number; active: boolean; onClick: () => void }[] = [
    {
      id: 'all',
      label: 'همه',
      count: summary.data ? allCount : undefined,
      active: filters.read === 'all' && filters.category === '',
      onClick: () => applyReadCategory('all', ''),
    },
    {
      id: 'unread',
      label: 'خوانده نشده',
      count: summary.data?.unread,
      active: filters.read === 'unread' && filters.category === '',
      onClick: () => applyReadCategory('unread', ''),
    },
    {
      id: 'trades',
      label: 'معاملات',
      count: summary.data?.trades,
      active: filters.read === 'all' && filters.category === 'trades',
      onClick: () => applyReadCategory('all', 'trades'),
    },
    {
      id: 'financial',
      label: 'مالی',
      count: summary.data?.financial,
      active: filters.read === 'all' && filters.category === 'financial',
      onClick: () => applyReadCategory('all', 'financial'),
    },
  ];

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
    if (selecting) {
      toggleSelected(item.id);
      return;
    }
    setOpenId(item.id);
    void markIds([item.id]);
  }

  const visibleIds = stacked.map((item) => item.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);
  const customPending = filters.range === 'custom' && !bounds;

  return (
    <div className="min-w-0 space-y-4">
      <header className="hidden lg:block">
        <h1 className="text-2xl font-bold text-[#202124]">اعلان‌های من</h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          مشاهده و مدیریت تمام اعلان‌ها، وضعیت معاملات و پیام‌های مهم سامانه
        </p>
      </header>

      <SummaryCards summary={summary.data} />

      <div className="flex items-center gap-2 lg:hidden">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={tab.active}
              onClick={tab.onClick}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-3 text-sm ${
                tab.active
                  ? 'border-[#C8922E] bg-[#FBF6EB] font-semibold text-[#202124]'
                  : 'border-[#E5E7EB] bg-white text-[#6B7280]'
              }`}
            >
              {tab.label}
              {tab.count != null ? <span>{toPersianDigits(String(tab.count))}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="جستجو در اعلان‌ها..."
          aria-label="جستجو در اعلان‌ها"
          className="h-11 min-w-0 flex-1 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#202124] outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]"
        />
        <div className="flex gap-2">
          <select
            aria-label="مرتب‌سازی"
            value={sort}
            onChange={(event) => setSort(event.target.value as NotificationSort)}
            className="h-11 min-w-[8.5rem] rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#202124]"
          >
            <option value="newest">جدیدترین</option>
            <option value="oldest">قدیمی‌ترین</option>
          </select>
          <Button
            type="button"
            variant="outline"
            className="h-11 lg:hidden"
            onClick={() => {
              setDraft(filters);
              setSheetOpen(true);
            }}
          >
            <SlidersHorizontal className="h-4 w-4" />
            فیلترها
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 lg:hidden"
            aria-pressed={selecting}
            onClick={() => {
              setSelecting((value) => !value);
              setSelected(new Set());
            }}
          >
            انتخاب
          </Button>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start lg:gap-6">
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="hidden min-h-11 items-center gap-2 text-sm text-[#202124] lg:inline-flex">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(visibleIds))}
                aria-label="انتخاب همه"
                className="h-4 w-4 accent-[#C8922E]"
              />
              انتخاب همه
            </label>
            {selecting ? (
              <Button type="button" variant="outline" className="h-11 lg:hidden" onClick={() => setSelected(allSelected ? new Set() : new Set(visibleIds))}>
                انتخاب همه
              </Button>
            ) : null}
            {(selected.size > 0 || (summary.data?.unread ?? 0) > 0) && (
              <>
                {selected.size > 0 ? (
                  <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => void markIds([...selected])}>
                    علامت‌گذاری به‌عنوان خوانده‌شده
                  </Button>
                ) : null}
                <Button type="button" variant="outline" className="h-11" disabled={busy || (summary.data?.unread ?? 0) === 0} onClick={() => void markEverything()}>
                  علامت‌گذاری همه به‌عنوان خوانده‌شده
                </Button>
              </>
            )}
          </div>

          {list.error ? (
            <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-10 text-center" role="alert">
              <p className="font-medium text-[#202124]">اعلان‌ها در حال حاضر قابل دریافت نیستند.</p>
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
            <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-12 text-center">
              <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FBF6EB]">
                <Bell className="h-6 w-6 text-[#C8922E]" aria-hidden />
              </span>
              <p className="mt-4 font-semibold text-[#202124]">
                {hasFilters ? 'اعلانی با این فیلترها پیدا نشد.' : 'اعلانی برای نمایش وجود ندارد.'}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-[#6B7280]">
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
            <div className="space-y-5">
              {customPending ? (
                <p className="text-sm text-[#6B7280]">برای بازه سفارشی، هر دو تاریخ را انتخاب کنید.</p>
              ) : null}
              {groups.map((group) => (
                <section key={group.key} className="space-y-2">
                  <h2 className="text-sm font-semibold text-[#6B7280]">{group.label}</h2>
                  <ul className="space-y-2">
                    {group.items.map((item) => {
                      const unread = !item.readAt;
                      const meta = CATEGORY_META[categoryOf(item.type)];
                      const Icon = meta.icon;
                      const title = notificationTitle(item);
                      return (
                        <li key={item.id}>
                          <article
                            className={`flex items-stretch gap-1 rounded-2xl border p-2 shadow-sm ${
                              unread ? 'border-[#F3E6C8] bg-[#FFFBF3]' : 'border-[#E5E7EB] bg-white'
                            }`}
                          >
                            <label
                              className={`hidden h-11 w-11 shrink-0 items-center justify-center lg:flex ${selecting ? '!flex' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={selected.has(item.id)}
                                onChange={() => toggleSelected(item.id)}
                                aria-label={`انتخاب ${title}`}
                                className="h-4 w-4 accent-[#C8922E]"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => openNotification(item)}
                              className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-xl px-2 py-2 text-start hover:bg-black/[0.02]"
                            >
                              <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta.tile}`}>
                                <Icon className={`h-5 w-5 ${meta.iconColor}`} aria-hidden />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-start justify-between gap-2">
                                  <span className={`text-sm text-[#202124] ${unread ? 'font-bold' : 'font-medium'}`}>
                                    {title}
                                  </span>
                                  {unread ? (
                                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#C8922E]" aria-hidden />
                                  ) : null}
                                </span>
                                <span className="sr-only">{unread ? 'خوانده نشده' : 'خوانده شده'}</span>
                                <span className="mt-1 line-clamp-2 block text-sm leading-6 text-[#6B7280]">{item.body}</span>
                                <span className="mt-2 flex items-center justify-between gap-2">
                                  <span className="text-xs text-[#6B7280]">{notificationStamp(item.createdAt)}</span>
                                  <span className="text-xs font-medium text-[#C8922E]">
                                    {entityActionLabel(item.relatedEntityType)}
                                  </span>
                                </span>
                              </span>
                            </button>
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
              <div className="hidden items-center justify-between gap-3 lg:flex">
                <p className="text-sm text-[#6B7280]">
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
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  {pageWindow(page, totalPages).map((entry, index) =>
                    entry === 'gap' ? (
                      <span key={`gap-${index}`} className="px-1 text-[#6B7280]">
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
                            ? 'border-[#C8922E] bg-[#FBF6EB] font-semibold text-[#202124]'
                            : 'border-[#E5E7EB] bg-white text-[#6B7280]'
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
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white disabled:opacity-40"
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

        <aside className="hidden rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm lg:block">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#202124]">فیلتر اعلان‌ها</h2>
            <button
              type="button"
              className="min-h-11 text-xs text-[#C8922E]"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setSearch('');
                setQuery('');
              }}
            >
              پاک کردن
            </button>
          </div>
          <FilterFields value={filters} onChange={setFilters} nameSuffix="-desk" />
        </aside>
      </div>

      <InboxSheet
        open={sheetOpen}
        title="فیلتر اعلان‌ها"
        onClose={() => setSheetOpen(false)}
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1"
              onClick={() => setDraft(EMPTY_FILTERS)}
            >
              پاک کردن
            </Button>
            <Button
              type="button"
              className="h-11 flex-1"
              onClick={() => {
                setFilters(draft);
                setSheetOpen(false);
              }}
            >
              اعمال فیلتر
            </Button>
          </div>
        }
      >
        <FilterFields value={draft} onChange={setDraft} nameSuffix="-sheet" />
      </InboxSheet>

      <InboxSheet
        open={openId != null}
        title={notificationTitle(
          detail.data ?? openItem ?? { type: '', subject: null },
        )}
        onClose={() => setOpenId(null)}
      >
        {detail.error ? (
          <div role="alert">
            <p className="text-sm text-[#202124]">اعلان‌ها در حال حاضر قابل دریافت نیستند.</p>
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
      <p className="text-[#6B7280]">نوع اعلان: {categoryLabel(item.type)}</p>
      <p className="whitespace-pre-wrap leading-7 text-[#202124]">{item.body}</p>
      <p className="text-xs text-[#6B7280]">{notificationStamp(item.createdAt)}</p>
      <p className="text-xs text-[#6B7280]">{unread ? 'خوانده نشده' : 'خوانده شده'}</p>
      {relation ? (
        <dl className="space-y-2 rounded-xl border border-[#E5E7EB] p-3">
          {relation.number ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[#6B7280]">{relationNumberLabel(relation.kind)}</dt>
              <dd className="font-medium text-[#202124]" dir="ltr">
                {toPersianDigits(relation.number)}
              </dd>
            </div>
          ) : null}
          {relation.amountRial ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[#6B7280]">مبلغ</dt>
              <dd className="font-medium text-[#202124]">{formatRial(relation.amountRial)}</dd>
            </div>
          ) : null}
          {relation.weightGrams ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[#6B7280]">وزن</dt>
              <dd className="font-medium text-[#202124]">{formatGrams(relation.weightGrams)}</dd>
            </div>
          ) : null}
          {relation.referenceNumber ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[#6B7280]">شماره پیگیری</dt>
              <dd className="font-medium text-[#202124]" dir="ltr">
                {toPersianDigits(relation.referenceNumber)}
              </dd>
            </div>
          ) : null}
          {relation.status ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[#6B7280]">وضعیت</dt>
              <dd className="font-medium text-[#202124]">{relationStatusLabel(relation)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {relation ? (
        <Link
          href={relation.href}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-[#C8922E] px-4 text-sm font-medium text-white"
        >
          {relationActionLabel(relation.kind)}
        </Link>
      ) : null}
    </div>
  );
}
