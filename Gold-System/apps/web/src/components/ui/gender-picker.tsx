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

      <div
        role="radiogroup"
        aria-label="جنسیت"
        className="flex items-start justify-start gap-1"
      >
        <GenderOption
          value="MALE"
          selected={selected}
          disabled={disabled}
          onToggle={toggle}
          label="مرد"
          iconColor={selected === 'MALE' ? 'text-blue-600' : 'text-blue-300'}
        >
          <MaleIcon className="h-10 w-10" />
        </GenderOption>

        <GenderOption
          value="FEMALE"
          selected={selected}
          disabled={disabled}
          onToggle={toggle}
          label="زن"
          iconColor={selected === 'FEMALE' ? 'text-pink-600' : 'text-pink-300'}
        >
          <FemaleIcon className="h-10 w-10" />
        </GenderOption>
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

function GenderOption({
  value,
  selected,
  disabled,
  onToggle,
  label,
  iconColor,
  children,
}: {
  value: GenderValue;
  selected: GenderValue | string;
  disabled?: boolean;
  onToggle: (v: GenderValue) => void;
  label: string;
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
        'rounded-md p-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <div className={cn('transition-colors duration-200', iconColor)}>
        {children}
      </div>
    </button>
  );
}
