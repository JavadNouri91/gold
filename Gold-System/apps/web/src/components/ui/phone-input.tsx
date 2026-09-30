'use client';

import { Input, type InputProps } from '@/components/ui/input';
import { toPersianDigits, latinPhone } from '@/lib/utils';

type PhoneInputProps = Omit<InputProps, 'value' | 'onChange' | 'type'> & {
  value?: string;
  /** Called with the Latin-digit string on every change. */
  onValueChange: (latin: string) => void;
};

/**
 * Controlled input for Iranian landline / work-phone / fax numbers.
 * - Displays Persian digits.
 * - Emits / stores plain Latin-digit string.
 */
export function PhoneInput({
  value,
  onValueChange,
  placeholder,
  ...props
}: PhoneInputProps) {
  return (
    <Input
      {...props}
      dir="ltr"
      type="tel"
      inputMode="numeric"
      autoComplete={props.autoComplete ?? 'tel'}
      placeholder={placeholder ?? '۰۲۱۱۲۳۴۵۶۷۸'}
      value={value ? toPersianDigits(latinPhone(value)) : ''}
      onChange={(e) => onValueChange(latinPhone(e.target.value))}
    />
  );
}
