'use client';

import { cn } from '@/lib/utils';

// ─── SVG silhouettes ──────────────────────────────────────────────────────────

function MaleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 72" fill="currentColor" xmlns="http://www.w3.org/2000/svg"
      className={className} aria-hidden="true">
      <circle cx="28" cy="14" r="11" />
      <path d="M10 32 C10 28 18 26 28 26 C38 26 46 28 46 32 L44 60 C44 62 36 64 28 64 C20 64 12 62 12 60 Z" />
    </svg>
  );
}

function FemaleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 72" fill="currentColor" xmlns="http://www.w3.org/2000/svg"
      className={className} aria-hidden="true">
      <circle cx="28" cy="14" r="11" />
      <path d="M20 26 C20 26 22 28 28 28 C34 28 36 26 36 26 L38 40 C38 40 36 38 28 38 C20 38 18 40 18 40 Z" />
      <path d="M14 42 C14 40 18 38 28 38 C38 38 42 40 42 42 L46 64 C46 64 38 66 28 66 C18 66 10 64 10 64 Z" />
    </svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type GenderValue = 'MALE' | 'FEMALE' | 'OTHER' | 'NOT_SPECIFIED' | '';

export interface GenderPickerProps {
  value?: GenderValue | string;
  onChange?: (value: GenderValue) => void;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GenderPicker({
  value = '',
  onChange,
  label,
  hint,
  error,
  required,
  disabled,
  className,
}: GenderPickerProps) {
  const selected = value as GenderValue;

  const toggle = (v: GenderValue) => {
    if (disabled) return;
    onChange?.(selected === v ? '' : v);
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Label */}
      {label && (
        <p className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-red-500 ms-1">*</span>}
        </p>
      )}

      {/* Two circles: male + female */}
      <div
        role="radiogroup"
        aria-label="جنسیت"
        className="flex items-start justify-center gap-10"
      >
        {/* ── مرد ── */}
        <CircleOption
          value="MALE"
          selected={selected}
          disabled={disabled}
          onToggle={toggle}
          label="مرد"
          ringColor="ring-blue-400"
          bgSelected="bg-blue-500"
          bgHover="hover:bg-blue-50"
          borderColor="border-blue-400"
          checkColor="bg-blue-600"
          iconColor={selected === 'MALE' ? 'text-white' : 'text-blue-300'}
        >
          <MaleIcon className="h-10 w-10" />
        </CircleOption>

        {/* ── زن ── */}
        <CircleOption
          value="FEMALE"
          selected={selected}
          disabled={disabled}
          onToggle={toggle}
          label="زن"
          ringColor="ring-pink-400"
          bgSelected="bg-pink-500"
          bgHover="hover:bg-pink-50"
          borderColor="border-pink-400"
          checkColor="bg-pink-600"
          iconColor={selected === 'FEMALE' ? 'text-white' : 'text-pink-300'}
        >
          <FemaleIcon className="h-10 w-10" />
        </CircleOption>
      </div>

      {/* Error / hint */}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

// ─── CircleOption sub-component ───────────────────────────────────────────────

function CircleOption({
  value,
  selected,
  disabled,
  onToggle,
  label,
  ringColor,
  bgSelected,
  bgHover,
  borderColor,
  checkColor,
  iconColor,
  children,
}: {
  value: GenderValue;
  selected: GenderValue | string;
  disabled?: boolean;
  onToggle: (v: GenderValue) => void;
  label: string;
  ringColor: string;
  bgSelected: string;
  bgHover: string;
  borderColor: string;
  checkColor: string;
  iconColor: string;
  children: React.ReactNode;
}) {
  const isSelected = selected === value;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      aria-label={label}
      disabled={disabled}
      onClick={() => onToggle(value)}
      className={cn(
        'group flex flex-col items-center gap-2',
        'focus-visible:outline-none',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {/* Circle */}
      <div
        className={cn(
          'relative flex h-20 w-20 items-center justify-center rounded-full border-2 transition-all duration-200',
          isSelected
            ? [bgSelected, borderColor, 'shadow-md']
            : [
                'border-border bg-muted/20',
                bgHover,
                `group-hover:${borderColor}`,
                `group-focus-visible:ring-2 group-focus-visible:${ringColor}`,
              ],
        )}
      >
        {/* Silhouette icon — color changes based on selection */}
        <div className={cn('transition-colors duration-200', iconColor)}>
          {children}
        </div>

        {/* Checkmark badge at bottom-end */}
        {isSelected && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute -bottom-1 -end-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white',
              checkColor,
            )}
          >
            <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m2 6 3 3 5-5" />
            </svg>
          </span>
        )}
      </div>

      {/* Label */}
      <span className={cn(
        'text-sm font-semibold transition-colors',
        isSelected
          ? value === 'MALE' ? 'text-blue-700' : 'text-pink-700'
          : 'text-muted-foreground group-hover:text-foreground',
      )}>
        {label}
      </span>
    </button>
  );
}
