'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Filter, Search, X } from 'lucide-react';
import type { ActivityBucket, ActivityList, ActivitySummary } from '@/lib/api';
import { ACTIVITY_RANGE_OPTIONS, type ActivityRangePreset } from '@/lib/activity-range';
import { DatePickerJalali } from '@/components/ui/date-picker-jalali';
import { ORDER_STATUS_LABELS, formatPurity } from '@/lib/utils';
import { ActivityDistribution, ActivitySummaryCards, ActivityVolumeChart } from './activity-visuals';
import { ActivityPagination, TransactionCards, TransactionTable } from './activity-transactions';

const selectClass =
  'min-h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#202124]';

export function MyTradesPage({
  preset,
  onPreset,
  customFrom,
  customTo,
  onCustomFrom,
  onCustomTo,
  bucket,
  onBucket,
  side,
  status,
  purity,
  search,
  onSide,
  onStatus,
  onPurity,
  onSearch,
  onClearFilters,
  page,
  limit,
  onPage,
  onLimit,
  summary,
  summaryLoading,
  summaryError,
  onRetrySummary,
  list,
  listLoading,
  listError,
  onRetryList,
  rangeReady,
}: {
  preset: ActivityRangePreset;
  onPreset: (preset: ActivityRangePreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFrom: (value: string) => void;
  onCustomTo: (value: string) => void;
  bucket: ActivityBucket;
  onBucket: (bucket: ActivityBucket) => void;
  side: '' | 'BUY' | 'SELL';
  status: string;
  purity: string;
  search: string;
  onSide: (side: '' | 'BUY' | 'SELL') => void;
  onStatus: (status: string) => void;
  onPurity: (purity: string) => void;
  onSearch: (search: string) => void;
  onClearFilters: () => void;
  page: number;
  limit: number;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
  summary?: ActivitySummary;
  summaryLoading: boolean;
  summaryError: boolean;
  onRetrySummary: () => void;
  list?: ActivityList;
  listLoading: boolean;
  listError: boolean;
  onRetryList: () => void;
  rangeReady: boolean;
}) {
  const filtersActive = Boolean(side || status || purity || search.trim());
  const rows = list?.data ?? [];
  const showOnboarding = Boolean(summary && !summary.hasAny && !filtersActive && (list?.meta.total ?? 0) === 0);

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-4 overflow-x-hidden">
      <header className="hidden lg:block">
        <h1 className="text-2xl font-bold text-[#202124]">معاملات من</h1>
        <p className="mt-1 text-sm text-[#6B7280]">مشاهده و مدیریت تمام معاملات خرید و فروش طلا</p>
      </header>

      <RangeControl
        preset={preset}
        onPreset={onPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFrom={onCustomFrom}
        onCustomTo={onCustomTo}
      />

      {preset === 'custom' && !rangeReady ? (
        <p className="text-sm text-[#6B7280]">تاریخ شروع و پایان بازه سفارشی را انتخاب کنید.</p>
      ) : null}

      {summaryError ? (
        <ErrorPanel message="اطلاعات معاملات در حال حاضر قابل دریافت نیست." onRetry={onRetrySummary} />
      ) : summaryLoading && !summary ? (
        <CardSkeleton />
      ) : summary ? (
        <>
          <ActivitySummaryCards summary={summary} />
          {summary.unclassified.count > 0 ? (
            <p className="text-xs leading-6 text-[#6B7280]">
              برخی معاملات جهت خرید یا فروش ندارند و فقط در حجم معاملات آمده‌اند.
            </p>
          ) : null}
          {summary.totalsBasis === 'booked' && summary.excludedCount > 0 ? (
            <p className="text-xs leading-6 text-[#6B7280]">
              پیش‌نویس، لغو، رد و برگشت در حجم، خرید و فروش محاسبه نشده‌اند.
            </p>
          ) : null}
          {summary.totalsBasis === 'status-filter' ? (
            <p className="text-xs leading-6 text-[#6B7280]">آمار این نما فقط وضعیت انتخاب‌شده را نشان می‌دهد.</p>
          ) : null}
        </>
      ) : null}

      {summary && !summaryError && !showOnboarding ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-3 lg:order-2">
            <ActivityVolumeChart
              series={summary.series}
              unit={summary.volume.unit}
              bucket={bucket}
              onBucket={onBucket}
            />
          </div>
          <div className="min-w-0 lg:col-span-2 lg:order-1">
            <ActivityDistribution summary={summary} />
          </div>
        </div>
      ) : null}

      <Filters
        side={side}
        status={status}
        purity={purity}
        purities={summary?.purities ?? []}
        search={search}
        preset={preset}
        customFrom={customFrom}
        customTo={customTo}
        onSide={onSide}
        onStatus={onStatus}
        onPurity={onPurity}
        onSearch={onSearch}
        onPreset={onPreset}
        onCustomFrom={onCustomFrom}
        onCustomTo={onCustomTo}
        onClear={onClearFilters}
      />

      {filtersActive ? (
        <ActiveFilters
          side={side}
          status={status}
          purity={purity}
          onSide={onSide}
          onStatus={onStatus}
          onPurity={onPurity}
          onClear={onClearFilters}
        />
      ) : null}

      {listError ? (
        <ErrorPanel message="لیست معاملات قابل دریافت نیست." onRetry={onRetryList} />
      ) : listLoading && !list ? (
        <ListSkeleton />
      ) : showOnboarding ? (
        <Onboarding />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-8 text-center">
          <p className="text-sm text-[#202124]">در این بازه معامله‌ای با فیلترهای انتخاب‌شده نیست.</p>
        </div>
      ) : (
        <>
          <h2 className="text-base font-bold text-[#202124]">آخرین معاملات</h2>
          <TransactionCards rows={rows} />
          <TransactionTable rows={rows} />
          {list ? (
            <ActivityPagination
              page={page}
              limit={limit}
              total={list.meta.total}
              onPage={onPage}
              onLimit={onLimit}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function RangeControl({
  preset,
  onPreset,
  customFrom,
  customTo,
  onCustomFrom,
  onCustomTo,
}: {
  preset: ActivityRangePreset;
  onPreset: (preset: ActivityRangePreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFrom: (value: string) => void;
  onCustomTo: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block max-w-xs text-sm text-[#6B7280]">
        بازه زمانی
        <select
          aria-label="بازه زمانی"
          value={preset}
          onChange={(event) => onPreset(event.target.value as ActivityRangePreset)}
          className={`${selectClass} mt-1`}
        >
          {ACTIVITY_RANGE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {preset === 'custom' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DatePickerJalali label="از" value={customFrom} onChange={onCustomFrom} />
          <DatePickerJalali label="تا" value={customTo} onChange={onCustomTo} />
        </div>
      ) : null}
    </div>
  );
}

function Filters(props: {
  side: '' | 'BUY' | 'SELL';
  status: string;
  purity: string;
  purities: string[];
  search: string;
  preset: ActivityRangePreset;
  customFrom: string;
  customTo: string;
  onSide: (side: '' | 'BUY' | 'SELL') => void;
  onStatus: (status: string) => void;
  onPurity: (purity: string) => void;
  onSearch: (search: string) => void;
  onPreset: (preset: ActivityRangePreset) => void;
  onCustomFrom: (value: string) => void;
  onCustomTo: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const [draft, setDraft] = useState({
    side: props.side,
    status: props.status,
    purity: props.purity,
    preset: props.preset,
    customFrom: props.customFrom,
    customTo: props.customTo,
  });

  function openSheet() {
    setDraft({
      side: props.side,
      status: props.status,
      purity: props.purity,
      preset: props.preset,
      customFrom: props.customFrom,
      customTo: props.customTo,
    });
    setOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={openSheet}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold"
        >
          <Filter className="h-4 w-4" aria-hidden />
          فیلترها
        </button>
      </div>
      <div className="hidden gap-3 lg:grid lg:grid-cols-4">
        <FilterFields
          side={props.side}
          status={props.status}
          purity={props.purity}
          purities={props.purities}
          onSide={props.onSide}
          onStatus={props.onStatus}
          onPurity={props.onPurity}
        />
        <SearchField value={props.search} onChange={props.onSearch} />
      </div>
      <div className="lg:hidden">
        <SearchField value={props.search} onChange={props.onSearch} />
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-labelledby="filter-sheet-title">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="بستن فیلترها" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <h2 id="filter-sheet-title" className="text-base font-bold text-[#202124]">
              فیلتر معاملات
            </h2>
            <div className="mt-4 space-y-4">
              <fieldset>
                <legend className="text-sm font-medium text-[#202124]">نوع معامله</legend>
                <div className="mt-2 space-y-2">
                  {(
                    [
                      ['', 'همه'],
                      ['BUY', 'خرید'],
                      ['SELL', 'فروش'],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={label} className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="sheet-side"
                        checked={draft.side === value}
                        onChange={() => setDraft((current) => ({ ...current, side: value }))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm font-medium text-[#202124]">
                وضعیت
                <select
                  aria-label="وضعیت معامله"
                  value={draft.status}
                  onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
                  className={`${selectClass} mt-1`}
                >
                  <option value="">همه</option>
                  {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-[#202124]">
                عیار
                <select
                  aria-label="عیار"
                  value={draft.purity}
                  onChange={(event) => setDraft((current) => ({ ...current, purity: event.target.value }))}
                  className={`${selectClass} mt-1`}
                >
                  <option value="">همه عیارها</option>
                  {props.purities.map((value) => (
                    <option key={value} value={value}>
                      {formatPurity(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-[#202124]">
                بازه زمانی
                <select
                  aria-label="بازه زمانی در فیلتر"
                  value={draft.preset}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, preset: event.target.value as ActivityRangePreset }))
                  }
                  className={`${selectClass} mt-1`}
                >
                  {ACTIVITY_RANGE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {draft.preset === 'custom' ? (
                <div className="grid grid-cols-1 gap-3">
                  <DatePickerJalali
                    label="از"
                    value={draft.customFrom}
                    onChange={(value) => setDraft((current) => ({ ...current, customFrom: value }))}
                  />
                  <DatePickerJalali
                    label="تا"
                    value={draft.customTo}
                    onChange={(value) => setDraft((current) => ({ ...current, customTo: value }))}
                  />
                </div>
              ) : null}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="min-h-11 rounded-xl border border-[#E5E7EB] text-sm font-semibold"
                onClick={() => {
                  props.onClear();
                  setOpen(false);
                }}
              >
                پاک کردن
              </button>
              <button
                type="button"
                className="min-h-11 rounded-xl bg-[#C8922E] text-sm font-semibold text-white"
                onClick={() => {
                  props.onSide(draft.side);
                  props.onStatus(draft.status);
                  props.onPurity(draft.purity);
                  props.onPreset(draft.preset);
                  props.onCustomFrom(draft.customFrom);
                  props.onCustomTo(draft.customTo);
                  setOpen(false);
                }}
              >
                اعمال فیلتر
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterFields({
  side,
  status,
  purity,
  purities,
  onSide,
  onStatus,
  onPurity,
}: {
  side: '' | 'BUY' | 'SELL';
  status: string;
  purity: string;
  purities: string[];
  onSide: (side: '' | 'BUY' | 'SELL') => void;
  onStatus: (status: string) => void;
  onPurity: (purity: string) => void;
}) {
  return (
    <>
      <select aria-label="نوع معامله" value={side} onChange={(event) => onSide(event.target.value as '' | 'BUY' | 'SELL')} className={selectClass}>
        <option value="">همه انواع</option>
        <option value="BUY">خرید</option>
        <option value="SELL">فروش</option>
      </select>
      <select aria-label="وضعیت" value={status} onChange={(event) => onStatus(event.target.value)} className={selectClass}>
        <option value="">همه وضعیت‌ها</option>
        {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select aria-label="عیار" value={purity} onChange={(event) => onPurity(event.target.value)} className={selectClass}>
        <option value="">همه عیارها</option>
        {purities.map((value) => (
          <option key={value} value={value}>
            {formatPurity(value)}
          </option>
        ))}
      </select>
    </>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="relative block">
      <span className="sr-only">جستجو در معاملات</span>
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" aria-hidden />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="جستجو در معاملات..."
        className={`${selectClass} pr-9`}
      />
    </label>
  );
}

function ActiveFilters({
  side,
  status,
  purity,
  onSide,
  onStatus,
  onPurity,
  onClear,
}: {
  side: '' | 'BUY' | 'SELL';
  status: string;
  purity: string;
  onSide: (side: '' | 'BUY' | 'SELL') => void;
  onStatus: (status: string) => void;
  onPurity: (purity: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-[#6B7280]">فیلترهای فعال:</span>
      {side ? <Chip label={side === 'BUY' ? 'خرید' : 'فروش'} onRemove={() => onSide('')} /> : null}
      {status ? <Chip label={ORDER_STATUS_LABELS[status] ?? status} onRemove={() => onStatus('')} /> : null}
      {purity ? <Chip label={`عیار ${formatPurity(purity)}`} onRemove={() => onPurity('')} /> : null}
      <button type="button" onClick={onClear} className="min-h-11 px-2 text-sm font-semibold text-[#C8922E]">
        پاک کردن همه
      </button>
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex min-h-11 items-center gap-1 rounded-full bg-[#FFF4D6] px-3 text-xs font-medium text-[#202124]"
    >
      {label}
      <X className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">حذف فیلتر</span>
    </button>
  );
}

function Onboarding() {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-10 text-center">
      <p className="text-lg font-bold text-[#202124]">هنوز معامله‌ای ثبت نکرده‌اید.</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-[#6B7280]">
        برای شروع می‌توانید اولین خرید یا فروش طلای خود را انجام دهید.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Link href="/portal/orders/new?side=buy" className="inline-flex min-h-11 items-center rounded-xl bg-[#16A34A] px-4 text-sm font-semibold text-white">
          خرید طلا
        </Link>
        <Link href="/portal/orders/new?side=sell" className="inline-flex min-h-11 items-center rounded-xl bg-[#DC2626] px-4 text-sm font-semibold text-white">
          فروش طلا
        </Link>
      </div>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
      <p className="text-sm text-[#202124]">{message}</p>
      <button type="button" onClick={onRetry} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold">
        تلاش مجدد
      </button>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-2xl bg-white" />
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-12 animate-pulse rounded-xl bg-white" />
      <div className="h-28 animate-pulse rounded-2xl bg-white" />
      <div className="h-28 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}
