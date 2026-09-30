'use client';

import { Input, type InputProps } from '@/components/ui/input';
import { formatMobile, latinMobile, MOBILE_PLACEHOLDER } from '@/lib/utils';

export function MobileNumber({
  value,
  className,
}: {
  value?: string | null;
  className?: string;
}) {
  if (!value?.trim()) return null;
  return (
    <span dir="ltr" className={className}>
      {formatMobile(value)}
    </span>
  );
}

type MobileInputProps = Omit<InputProps, 'value' | 'onChange' | 'type'> & {
  value?: string;
  onValueChange: (latin: string) => void;
};

export function MobileInput({
  value,
  onValueChange,
  placeholder,
  ...props
}: MobileInputProps) {
  return (
    <Input
      {...props}
      dir="ltr"
      type="tel"
      inputMode="numeric"
      autoComplete={props.autoComplete ?? 'tel'}
      placeholder={placeholder ?? MOBILE_PLACEHOLDER}
      value={formatMobile(value ?? '', '')}
      onChange={(event) => onValueChange(latinMobile(event.target.value))}
    />
  );
}
