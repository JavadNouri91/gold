'use client';

import { useCallback, useState } from 'react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { internalCustomersApi } from '@/lib/internal-api';
import { formatMobile, toLatinDigits } from '@/lib/utils';

type Option = { value: string; label: string };

export function ReferrerPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (customerId: string) => void;
}) {
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState<Option | null>(null);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const result = await internalCustomersApi.list({
        search: toLatinDigits(query.trim()) || undefined,
        limit: 20,
        page: 1,
      });
      setOptions(
        result.items.map((item) => ({
          value: item.id,
          label: `${item.fullName} — ${formatMobile(item.mobile, item.mobile)}`,
        })),
      );
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const merged = selected && !options.some((opt) => opt.value === selected.value)
    ? [selected, ...options]
    : options;

  return (
    <SearchableSelect
      label="معرف"
      hint="جستجو با نام، نام خانوادگی یا شماره موبایل"
      placeholder="انتخاب معرف..."
      searchPlaceholder="نام یا موبایل را بنویسید..."
      emptyMessage="مشتری‌ای با این مشخصات پیدا نشد"
      value={value}
      options={merged}
      loading={loading}
      onChange={(id) => {
        const next = merged.find((opt) => opt.value === id) ?? null;
        setSelected(id ? next : null);
        onChange(id);
      }}
      onQueryChange={search}
    />
  );
}
