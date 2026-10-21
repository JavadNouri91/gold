'use client';

import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface FilterField {
  key: string;
  label: string;
  type?: 'text' | 'select' | 'date';
  options?: Array<{ value: string; label: string }>;
  dir?: 'ltr' | 'rtl';
  placeholder?: string;
}

export function FilterBar({
  fields,
  values,
  onChange,
  onSubmit,
  onReset,
  extra,
  live = false,
}: {
  fields: FilterField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onSubmit?: () => void;
  onReset?: () => void;
  extra?: ReactNode;
  live?: boolean;
}) {
  return (
    <form
      className="grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 md:grid-cols-2 xl:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!live) onSubmit?.();
      }}
    >
      {fields.map((field) =>
        field.type === 'select' ? (
          <label key={field.key} className="space-y-1 text-sm">
            <span className="font-medium">{field.label}</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 font-sans text-sm"
              value={values[field.key] ?? ''}
              onChange={(event) => onChange(field.key, event.target.value)}
            >
              <option value="">همه</option>
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <Input
            key={field.key}
            label={field.label}
            type={field.type === 'date' ? 'date' : 'text'}
            dir={field.dir ?? (field.type === 'date' ? 'ltr' : 'rtl')}
            placeholder={field.placeholder}
            value={values[field.key] ?? ''}
            onChange={(event) => onChange(field.key, event.target.value)}
          />
        ),
      )}
      {extra}
      {!live || onReset ? (
        <div className="flex items-end gap-2">
          {live ? null : (
            <Button type="submit">اعمال فیلتر</Button>
          )}
          {onReset ? (
            <Button type="button" variant="outline" onClick={onReset}>
              پاک کردن
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
