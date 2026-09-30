'use client';

/**
 * DatePickerJalali — drill-down Jalali calendar
 *
 * Flow (no date selected):  Year picker → Month picker → Day grid
 * Flow (date selected):     Opens in day grid of that month
 * Click header in any mode: Back to Year picker
 *
 * Constraint: birth date cannot be in the future.
 *   - Year list capped at current Jalali year
 *   - Future months disabled in current year
 *   - Future days disabled in current month of current year
 *
 * Value in / out: ISO Gregorian string "YYYY-MM-DD" (or empty string).
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { toGregorian, toJalaali, jalaaliMonthLength } from 'jalaali-js';
import { CalendarDays, ChevronRight, ChevronLeft, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد',
  'تیر',     'مرداد',    'شهریور',
  'مهر',     'آبان',     'آذر',
  'دی',      'بهمن',     'اسفند',
] as const;

const WEEK_HEADERS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const;
const YEAR_MIN = 1300;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseGregorian(iso: string): { gy: number; gm: number; gd: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return null;
  return { gy: +m[1], gm: +m[2], gd: +m[3] };
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function todayJalali() {
  const t = new Date();
  return toJalaali(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

function firstDayColumn(jy: number, jm: number): number {
  const { gy, gm, gd } = toGregorian(jy, jm, 1);
  const jsDay = new Date(gy, gm - 1, gd).getDay();
  return (jsDay + 1) % 7; // 0 = شنبه … 6 = جمعه
}

function prevMonthOf(jy: number, jm: number) {
  return jm === 1 ? { jy: jy - 1, jm: 12 } : { jy, jm: jm - 1 };
}

function nextMonthOf(jy: number, jm: number) {
  return jm === 12 ? { jy: jy + 1, jm: 1 } : { jy, jm: jm + 1 };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CalMode = 'year' | 'month' | 'day';

export interface DatePickerJalaliProps {
  value?: string;
  onChange?: (gregorianIso: string) => void;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Birth dates stay capped at today. Holiday dates may be in the future. */
  allowFuture?: boolean;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DatePickerJalali({
  value = '',
  onChange,
  label,
  hint,
  error,
  required,
  disabled,
  allowFuture = false,
  className,
}: DatePickerJalaliProps) {
  const [open, setOpen]         = useState(false);
  const [mode, setMode]         = useState<CalMode>('year');
  const [viewYear, setViewYear] = useState(0);
  const [viewMonth, setViewMonth] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const yearGridRef  = useRef<HTMLDivElement>(null);
  const monthGridRef = useRef<HTMLDivElement>(null);

  // ── today & derived constants ─────────────────────────────────────────────
  // Defined first so navigation guards can reference them.
  const today   = useMemo(() => todayJalali(), []);
  const YEAR_MAX = allowFuture ? today.jy + 10 : today.jy;

  // ── Parsed selected value ─────────────────────────────────────────────────
  const selected = useMemo<{ jy: number; jm: number; jd: number } | null>(() => {
    const g = parseGregorian(value);
    if (!g) return null;
    try { return toJalaali(g.gy, g.gm, g.gd); } catch { return null; }
  }, [value]);

  const displayText = selected
    ? `${selected.jd.toLocaleString('fa-IR')} ${JALALI_MONTHS[selected.jm - 1]} ${selected.jy.toLocaleString('fa-IR', { useGrouping: false })}`
    : '';

  // ── Open calendar ─────────────────────────────────────────────────────────
  const openCalendar = () => {
    if (disabled) return;
    if (selected) {
      setViewYear(selected.jy);
      setViewMonth(selected.jm);
      setMode('day');
    } else {
      setViewYear(today.jy);
      setViewMonth(today.jm);
      setMode('year');
    }
    setOpen(true);
  };

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // ── Scroll selected item into view when picker opens ─────────────────────
  useEffect(() => {
    if (!open || mode !== 'year') return;
    requestAnimationFrame(() => {
      yearGridRef.current?.querySelector<HTMLElement>('[data-selected]')?.scrollIntoView({ block: 'center' });
    });
  }, [open, mode]);

  useEffect(() => {
    if (!open || mode !== 'month') return;
    requestAnimationFrame(() => {
      monthGridRef.current?.querySelector<HTMLElement>('[data-selected]')?.scrollIntoView({ block: 'center' });
    });
  }, [open, mode]);

  // ── Day grid navigation ───────────────────────────────────────────────────
  const canGoPrev = viewYear > YEAR_MIN || viewMonth > 1;
  const canGoNext =
    !(viewYear >= today.jy && viewMonth >= today.jm); // cannot navigate past current month

  const goPrev = () => {
    if (!canGoPrev) return;
    const { jy, jm } = prevMonthOf(viewYear, viewMonth);
    setViewYear(jy); setViewMonth(jm);
  };

  const goNext = () => {
    if (!canGoNext) return;
    const { jy, jm } = nextMonthOf(viewYear, viewMonth);
    setViewYear(jy); setViewMonth(jm);
  };

  // ── Drill-down selections ─────────────────────────────────────────────────
  const selectYear = (y: number) => { setViewYear(y); setMode('month'); };

  const selectMonth = (m: number) => { setViewMonth(m); setMode('day'); };

  const selectDay = (day: number) => {
    try {
      const { gy, gm, gd } = toGregorian(viewYear, viewMonth, day);
      onChange?.(`${gy}-${pad2(gm)}-${pad2(gd)}`);
    } catch {
      onChange?.('');
    }
    setOpen(false);
  };

  const clearValue = (e: React.MouseEvent) => { e.stopPropagation(); onChange?.(''); };

  // ── Day grid cells ────────────────────────────────────────────────────────
  const { cells, dayCount } = useMemo(() => {
    if (!viewYear || !viewMonth) return { cells: [], dayCount: 30 };
    const dc     = jalaaliMonthLength(viewYear, viewMonth);
    const offset = firstDayColumn(viewYear, viewMonth);
    const list: Array<{ day: number; blank: boolean }> = [];
    for (let i = 0; i < offset; i++) list.push({ day: 0, blank: true });
    for (let d = 1; d <= dc; d++) list.push({ day: d, blank: false });
    while (list.length % 7 !== 0) list.push({ day: 0, blank: true });
    return { cells: list, dayCount: dc };
  }, [viewYear, viewMonth]);

  // ── Year list ─────────────────────────────────────────────────────────────
  const allYears = useMemo(() => {
    const arr: number[] = [];
    for (let y = YEAR_MAX; y >= YEAR_MIN; y--) arr.push(y);
    return arr;
  }, [YEAR_MAX]);

  // ── Breadcrumb title ──────────────────────────────────────────────────────
  const breadcrumb =
    mode === 'year'  ? 'انتخاب سال' :
    mode === 'month' ? `سال ${viewYear.toLocaleString('fa-IR', { useGrouping: false })}` :
    `${JALALI_MONTHS[viewMonth - 1]} ${viewYear.toLocaleString('fa-IR', { useGrouping: false })}`;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className={cn('relative space-y-1', className)}>
      {/* ── Label ── */}
      {label && (
        <label className="block text-sm font-medium text-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-gold-600" />
            {label}
          </span>
          {required && <span className="text-red-500 ms-1">*</span>}
        </label>
      )}

      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={openCalendar}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 text-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-red-500' : 'border-input',
          !displayText && 'text-muted-foreground',
        )}
      >
        <span>{displayText || 'انتخاب تاریخ...'}</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          {displayText && (
            <span
              role="button"
              aria-label="پاک کردن تاریخ"
              onClick={clearValue}
              className="rounded p-0.5 hover:bg-muted hover:text-foreground"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </span>
          )}
          <CalendarDays className="h-4 w-4" />
        </span>
      </button>

      {/* ── Error / hint ── */}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}

      {/* ═══════════════════════════════════════════════
          Calendar popup
      ═══════════════════════════════════════════════ */}
      {open && (
        <div
          role="dialog"
          aria-label="انتخاب تاریخ شمسی"
          className={cn(
            'absolute end-0 z-50 mt-1 w-72 rounded-xl border bg-white shadow-xl',
            'animate-in fade-in-0 zoom-in-95 duration-150',
          )}
        >
          {/* ─── Header ─── */}
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            {/* ❮ next month (day mode only) */}
            <button
              type="button"
              onClick={mode === 'day' ? goNext : undefined}
              disabled={mode !== 'day' || !canGoNext}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:invisible"
              aria-label="ماه بعد"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* Title / breadcrumb */}
            <button
              type="button"
              onClick={() => { if (mode !== 'year') setMode('year'); }}
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold',
                mode !== 'year' ? 'hover:bg-muted cursor-pointer' : 'cursor-default',
              )}
              aria-label={mode !== 'year' ? 'بازگشت به انتخاب سال' : undefined}
            >
              {breadcrumb}
              {mode !== 'year' && <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>

            {/* ❯ prev month (day mode only) */}
            <button
              type="button"
              onClick={mode === 'day' ? goPrev : undefined}
              disabled={mode !== 'day' || !canGoPrev}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:invisible"
              aria-label="ماه قبل"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* ═══════════ YEAR picker ═══════════ */}
          {mode === 'year' && (
            <div
              ref={yearGridRef}
              className="grid max-h-56 grid-cols-4 gap-1 overflow-y-auto p-3"
            >
              {allYears.map((y) => {
                const isSel     = !!selected && selected.jy === y;
                const isCurrent = today.jy === y;
                return (
                  <button
                    key={y}
                    type="button"
                    data-selected={isSel ? '' : undefined}
                    onClick={() => selectYear(y)}
                    className={cn(
                      'rounded-md px-1 py-2 text-xs font-medium transition-colors',
                      isSel
                        ? 'bg-gold-500 text-white'
                        : isCurrent
                          ? 'border border-gold-300 text-gold-700 hover:bg-gold-50'
                          : 'text-foreground hover:bg-muted',
                    )}
                  >
                    {y.toLocaleString('fa-IR', { useGrouping: false })}
                  </button>
                );
              })}
            </div>
          )}

          {/* ═══════════ MONTH picker ═══════════ */}
          {mode === 'month' && (
            <div
              ref={monthGridRef}
              className="grid grid-cols-3 gap-2 p-4"
            >
              {JALALI_MONTHS.map((name, idx) => {
                const mNum     = idx + 1;
                const isSel    = !!selected && selected.jy === viewYear && selected.jm === mNum;
                const isCurrent = today.jy === viewYear && today.jm === mNum;
                // Disable months that are in the future (only applies to the current year)
                const isFuture = !allowFuture && viewYear >= today.jy && mNum > today.jm;
                return (
                  <button
                    key={mNum}
                    type="button"
                    data-selected={isSel ? '' : undefined}
                    disabled={isFuture}
                    onClick={() => selectMonth(mNum)}
                    className={cn(
                      'rounded-lg px-2 py-3 text-sm font-medium transition-colors',
                      isFuture
                        ? 'cursor-not-allowed opacity-30'
                        : isSel
                          ? 'bg-gold-500 text-white shadow-sm'
                          : isCurrent
                            ? 'border border-gold-300 text-gold-700 hover:bg-gold-50'
                            : 'text-foreground hover:bg-muted',
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}

          {/* ═══════════ DAY grid ═══════════ */}
          {mode === 'day' && (
            <div className="p-3">
              {/* Week day headers */}
              <div className="mb-1 grid grid-cols-7">
                {WEEK_HEADERS.map((h) => (
                  <div key={h} className="flex h-8 items-center justify-center text-[11px] font-medium text-muted-foreground">
                    {h}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-y-0.5">
                {cells.map((cell, idx) => {
                  if (cell.blank) return <div key={`b-${idx}`} />;

                  const isSelected =
                    selected?.jy === viewYear &&
                    selected?.jm === viewMonth &&
                    selected?.jd === cell.day;

                  const isToday =
                    today.jy === viewYear &&
                    today.jm === viewMonth &&
                    today.jd === cell.day;

                  // Disable days after today when viewing the current year+month
                  const isFuture =
                    !allowFuture &&
                    viewYear >= today.jy &&
                    viewMonth >= today.jm &&
                    cell.day > today.jd;

                  return (
                    <button
                      key={cell.day}
                      type="button"
                      disabled={isFuture}
                      onClick={() => selectDay(cell.day)}
                      aria-label={`${cell.day} ${JALALI_MONTHS[viewMonth - 1]} ${viewYear}`}
                      aria-pressed={isSelected}
                      className={cn(
                        'flex h-8 w-full items-center justify-center rounded-md text-sm transition-colors',
                        isFuture
                          ? 'cursor-not-allowed opacity-25'
                          : isSelected
                            ? 'bg-gold-500 font-semibold text-white hover:bg-gold-600'
                            : isToday
                              ? 'border border-gold-400 font-semibold text-gold-700 hover:bg-gold-50'
                              : 'text-foreground hover:bg-muted',
                      )}
                    >
                      {cell.day.toLocaleString('fa-IR')}
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                {JALALI_MONTHS[viewMonth - 1]}{' '}
                {viewYear.toLocaleString('fa-IR', { useGrouping: false })} —{' '}
                {dayCount.toLocaleString('fa-IR')} روز
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
