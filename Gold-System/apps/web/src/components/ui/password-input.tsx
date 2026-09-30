'use client';

import { useState, useId, forwardRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InputProps } from '@/components/ui/input';

type PasswordInputProps = Omit<InputProps, 'type'>;

/**
 * Password input with a show/hide toggle eye button.
 * Uses forwardRef so React Hook Form's ref reaches the <input> element —
 * required for register() validation to work correctly.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ label, error, hint, required, id, className, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    const uid = useId();
    const inputId = id ?? label ?? uid;

    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
            {label}
            {required && <span className="text-red-500 ms-1">*</span>}
          </label>
        )}

        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            dir="ltr"
            type={visible ? 'text' : 'password'}
            required={required}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined}
            className={cn(
              'flex h-10 w-full rounded-md border bg-background pe-3 ps-10 py-2 text-sm',
              'placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error ? 'border-red-500' : 'border-input',
              className,
            )}
            {...props}
          />

          {/* Toggle button — eye icon on the right */}
          <button
            type="button"
            tabIndex={-1}
            aria-label={visible ? 'مخفی کردن رمز عبور' : 'نمایش رمز عبور'}
            onClick={() => setVisible((v) => !v)}
            className={cn(
              'absolute inset-y-0 start-0 flex w-10 items-center justify-center',
              'text-muted-foreground transition-colors hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500',
              'rounded-s-md',
            )}
          >
            {visible ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
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

PasswordInput.displayName = 'PasswordInput';
