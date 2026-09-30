'use client';

import { forwardRef } from 'react';
import { Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPostalCode, latinPostalCode } from '@/lib/utils';
import type { InputProps } from '@/components/ui/input';

type PostalCodeInputProps = Omit<InputProps, 'value' | 'onChange' | 'type'> & {
  value?: string;
  /** Called with the 10-digit Latin string on every change. */
  onValueChange: (latin: string) => void;
};

/**
 * Controlled postal code input.
 * - Displays as "۱۲۳۴۵-۶۷۸۹۰" (Persian digits, auto-dash after position 5).
 * - Emits / stores plain 10-digit Latin string (no dash).
 * - Envelope icon built-in on the start side.
 * - Uses forwardRef so RHF ref reaches the <input> for validation.
 */
export const PostalCodeInput = forwardRef<HTMLInputElement, PostalCodeInputProps>(
  function PostalCodeInput(
    { label, error, hint, required, id, className, value, onValueChange, ...props },
    ref,
  ) {
    const inputId = id ?? (label as string | undefined) ?? 'postal-code';

    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
            {label}
            {required && <span className="text-red-500 ms-1">*</span>}
          </label>
        )}

        <div className="relative">
          {/* Envelope icon */}
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted-foreground">
            <Mail className="h-4 w-4" />
          </span>

          <input
            ref={ref}
            id={inputId}
            dir="ltr"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={11} /* 10 digits + 1 dash */
            placeholder="۱۲۳۴۵-۶۷۸۹۰"
            aria-invalid={!!error}
            aria-describedby={
              error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined
            }
            value={formatPostalCode(value ?? '', '')}
            onChange={(e) => onValueChange(latinPostalCode(e.target.value))}
            className={cn(
              'flex h-10 w-full rounded-md border bg-background ps-9 pe-3 py-2 text-sm',
              'placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error ? 'border-red-500' : 'border-input',
              className,
            )}
            {...props}
          />
        </div>

        {error && (
          <p id={`${inputId}-err`} className="text-xs text-red-600">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

PostalCodeInput.displayName = 'PostalCodeInput';
