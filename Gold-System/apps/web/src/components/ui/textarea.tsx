import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  dir?: 'ltr' | 'rtl';
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, dir = 'rtl', required, ...props }, ref) => {
    const inputId = id ?? label;
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
            {label}
            {required && <span className="text-red-500 ms-1">*</span>}
          </label>
        )}
        <textarea
          id={inputId}
          dir={dir}
          ref={ref}
          required={required}
          className={cn(
            'flex min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm leading-6',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-red-500' : 'border-input',
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        {!error && hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
