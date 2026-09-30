'use client';

import { Input, type InputProps } from '@/components/ui/input';
import { formatNationalId, latinNationalId } from '@/lib/utils';

/** Display-only span — renders the national ID with Persian digits. */
export function NationalIdNumber({
  value,
  className,
}: {
  value?: string | null;
  className?: string;
}) {
  if (!value?.trim()) return null;
  return (
    <span dir="ltr" className={className}>
      {formatNationalId(value)}
    </span>
  );
}

type NationalIdInputProps = Omit<InputProps, 'value' | 'onChange' | 'type'> & {
  value?: string;
  /** Called with the 10-digit Latin string on every change. */
  onValueChange: (latin: string) => void;
};

/**
 * Controlled input for Iranian national IDs.
 * - Accepts Persian, Arabic, or Latin digits from the user.
 * - Converts to Latin on change and passes to `onValueChange`.
 * - Displays the stored Latin value as Persian digits (۰–۹).
 * - Capped at 10 characters.
 */
export function NationalIdInput({
  value,
  onValueChange,
  placeholder,
  ...props
}: NationalIdInputProps) {
  return (
    <Input
      {...props}
      dir="ltr"
      type="text"
      inputMode="numeric"
      autoComplete={props.autoComplete ?? 'off'}
      maxLength={10}
      placeholder={placeholder ?? '۰۰۱۲۳۴۵۶۷۸'}
      value={formatNationalId(value ?? '', '')}
      onChange={(e) => onValueChange(latinNationalId(e.target.value))}
    />
  );
}
