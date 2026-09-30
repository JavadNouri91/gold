'use client';

import { DatePickerJalali } from '@/components/ui/date-picker-jalali';
import type { NotificationCategory, NotificationReadFilter } from '@/lib/api';
import { cn } from '@/lib/utils';

export type DateRange = 'all' | 'today' | '7d' | '30d' | 'custom';

export interface InboxFilterValue {
  read: NotificationReadFilter;
  category: NotificationCategory | '';
  range: DateRange;
  customFrom: string;
  customTo: string;
}

export const EMPTY_FILTERS: InboxFilterValue = {
  read: 'all',
  category: '',
  range: 'all',
  customFrom: '',
  customTo: '',
};

const READ_OPTIONS: { id: NotificationReadFilter; label: string }[] = [
  { id: 'all', label: 'همه' },
  { id: 'unread', label: 'خوانده نشده' },
  { id: 'read', label: 'خوانده شده' },
];

const CATEGORY_OPTIONS: { id: NotificationCategory | ''; label: string }[] = [
  { id: '', label: 'همه' },
  { id: 'trades', label: 'معاملات' },
  { id: 'financial', label: 'مالی و پرداخت' },
  { id: 'kyc', label: 'احراز هویت' },
  { id: 'account', label: 'حساب' },
];

const RANGE_OPTIONS: { id: DateRange; label: string }[] = [
  { id: 'all', label: 'همه' },
  { id: 'today', label: 'امروز' },
  { id: '7d', label: '۷ روز' },
  { id: '30d', label: '۳۰ روز' },
  { id: 'custom', label: 'سفارشی' },
];

function RadioGroup<T extends string>({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold text-[#202124]">{label}</legend>
      <div className="space-y-0.5">
        {options.map((option) => (
          <label key={option.id || 'all'} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[#202124]">
            <input
              type="radio"
              name={name}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
              className="h-4 w-4 accent-[#C8922E]"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FilterFields({
  value,
  onChange,
  nameSuffix = '',
}: {
  value: InboxFilterValue;
  onChange: (value: InboxFilterValue) => void;
  nameSuffix?: string;
}) {
  return (
    <div className="space-y-4">
      <RadioGroup
        label="وضعیت"
        name={`read${nameSuffix}`}
        value={value.read}
        options={READ_OPTIONS}
        onChange={(read) => onChange({ ...value, read })}
      />
      <RadioGroup
        label="نوع"
        name={`category${nameSuffix}`}
        value={value.category}
        options={CATEGORY_OPTIONS}
        onChange={(category) => onChange({ ...value, category })}
      />
      <RadioGroup
        label="زمان"
        name={`range${nameSuffix}`}
        value={value.range}
        options={RANGE_OPTIONS}
        onChange={(range) => onChange({ ...value, range })}
      />
      {value.range === 'custom' ? (
        <div className={cn('space-y-3 rounded-xl border border-[#E5E7EB] p-3')}>
          <DatePickerJalali
            label="از تاریخ"
            value={value.customFrom}
            onChange={(customFrom) => onChange({ ...value, customFrom })}
          />
          <DatePickerJalali
            label="تا تاریخ"
            value={value.customTo}
            onChange={(customTo) => onChange({ ...value, customTo })}
          />
        </div>
      ) : null}
    </div>
  );
}

export function filtersAreClear(value: InboxFilterValue, query: string): boolean {
  return (
    value.read === 'all' &&
    value.category === '' &&
    value.range === 'all' &&
    query.trim() === ''
  );
}
