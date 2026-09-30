'use client';

/**
 * SearchableSelect — a filterable dropdown for large option lists.
 *
 * - Shows a text input to filter options by typing
 * - Renders a floating list of matching options
 * - Keyboard-navigable (Arrow keys, Enter, Escape)
 * - RTL-ready
 */

import { useState, useRef, useEffect, useId, useMemo } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

export interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
  className?: string;
  id?: string;
}

export function SearchableSelect({
  options,
  value = '',
  onChange,
  placeholder = 'انتخاب کنید...',
  searchPlaceholder = 'جستجو...',
  label,
  hint,
  error,
  required,
  disabled,
  emptyMessage = 'موردی یافت نشد',
  className,
  id,
}: SearchableSelectProps) {
  const uid = useId();
  const inputId = id ?? uid;

  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState('');
  const [highlighted, setHighlighted] = useState(0);

  const containerRef  = useRef<HTMLDivElement>(null);
  const searchRef     = useRef<HTMLInputElement>(null);
  const listRef       = useRef<HTMLUListElement>(null);

  // ── Display label for currently selected value ──────────────────────────
  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? '',
    [options, value],
  );

  // ── Filtered options ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // ── Reset highlight when filtered list changes ────────────────────────────
  useEffect(() => { setHighlighted(0); }, [filtered]);

  // ── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Focus search when dropdown opens ──────────────────────────────────────
  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  // ── Scroll highlighted item into view ─────────────────────────────────────
  useEffect(() => {
    if (!open || !listRef.current) return;
    const item = listRef.current.children[highlighted] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, open]);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlighted]) select(filtered[highlighted]!.value);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const select = (val: string) => {
    onChange?.(val);
    setOpen(false);
    setQuery('');
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.('');
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className={cn('relative space-y-1', className)}>
      {/* Label */}
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-red-500 ms-1">*</span>}
        </label>
      )}

      {/* Trigger button */}
      <button
        type="button"
        id={inputId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={!!error}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 text-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-red-500' : 'border-input',
          !selectedLabel && 'text-muted-foreground',
        )}
      >
        <span className="truncate">{selectedLabel || placeholder}</span>
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground ms-2">
          {selectedLabel && (
            <span
              role="button"
              aria-label="پاک کردن"
              onClick={clear}
              className="rounded p-0.5 hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className={cn(
            'absolute end-0 start-0 z-50 mt-1 rounded-xl border bg-white shadow-xl',
            'animate-in fade-in-0 zoom-in-95 duration-150',
          )}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="جستجو در لیست"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Options list */}
          <ul
            ref={listRef}
            className="max-h-52 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted-foreground text-center">
                {emptyMessage}
              </li>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected   = opt.value === value;
                const isHighlighted = idx === highlighted;
                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => select(opt.value)}
                    onMouseEnter={() => setHighlighted(idx)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between px-4 py-2 text-sm',
                      isSelected
                        ? 'bg-gold-50 font-semibold text-gold-800'
                        : isHighlighted
                          ? 'bg-muted'
                          : 'text-foreground',
                    )}
                  >
                    {opt.label}
                    {isSelected && (
                      <svg className="h-4 w-4 text-gold-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </li>
                );
              })
            )}
          </ul>

          {/* Footer: count */}
          {filtered.length > 0 && (
            <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
              {filtered.length.toLocaleString('fa-IR')} مورد
              {query && ` از ${options.length.toLocaleString('fa-IR')}`}
            </p>
          )}
        </div>
      )}

      {/* Error / hint */}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
