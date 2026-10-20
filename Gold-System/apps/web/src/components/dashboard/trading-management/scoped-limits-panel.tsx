'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { ApiErrorState, SkeletonBlock } from '@/components/dashboard/states';
import {
  internalCustomersApi,
  tradingApi,
  type StaffCustomer,
  type TradingCustomerLimitRow,
  type TradingGroupLimitRow,
} from '@/lib/internal-api';
import {
  formatGroupedPersianDecimal,
  formatGroupedPersianInteger,
  formatMobile,
  formatMoney,
  formatWeight,
  rialToToman,
  toLatinDigits,
  tomanToRial,
} from '@/lib/utils';

function tomanField(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  const toman = rialToToman(value);
  return toman ? formatGroupedPersianInteger(toman) : '';
}

function weightField(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  return formatGroupedPersianDecimal(String(value));
}

function rialOrNull(value: string): string | null {
  const text = toLatinDigits(value).replace(/,/g, '').replace(/\s/g, '').trim();
  if (!text) return null;
  const rial = tomanToRial(text);
  if (rial == null) throw new Error('مقدار عددی نامعتبر است.');
  return rial;
}

function weightOrNull(value: string): string | null {
  const text = toLatinDigits(value).replace(/,/g, '').replace(/\s/g, '').trim();
  if (!text) return null;
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error('مقدار عددی نامعتبر است.');
  return text;
}

function moneyDisplay(rial: string | null): string {
  if (rial == null || rial === '') return '—';
  return formatMoney(rial);
}

function gramsDisplay(value: string | null): string {
  if (value == null || value === '') return '—';
  return formatWeight(value);
}

export function ScopedLimitsPanel({
  canEdit,
  busy,
  onBusy,
  onNotice,
}: {
  canEdit: boolean;
  busy: boolean;
  onBusy: (action: () => Promise<void>) => Promise<void>;
  onNotice: (message: string | null) => void;
}) {
  const limits = useSWR('trading-scoped-limits', () => tradingApi.listLimits());
  const [drafts, setDrafts] = useState<Record<string, { amount: string; weight: string }>>({});
  const [customerDraft, setCustomerDraft] = useState<{
    customerId: string;
    name: string;
    typeLabel: string | null;
    amount: string;
    weight: string;
    existingId: string | null;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<StaffCustomer[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!limits.data) return;
    const next: Record<string, { amount: string; weight: string }> = {};
    for (const row of limits.data.groupLimits) {
      next[row.scopeKey] = {
        amount: tomanField(row.maxAmountRial),
        weight: weightField(row.maxWeightGrams),
      };
    }
    setDrafts(next);
  }, [limits.data]);

  const groupByType = useMemo(() => {
    const map = new Map<string, TradingGroupLimitRow>();
    for (const row of limits.data?.groupLimits ?? []) map.set(row.scopeKey, row);
    return map;
  }, [limits.data]);

  const saveGroup = async (scopeKey: string) => {
    const draft = drafts[scopeKey] ?? { amount: '', weight: '' };
    const maxAmountRial = rialOrNull(draft.amount);
    const maxWeightGrams = weightOrNull(draft.weight);
    const existing = groupByType.get(scopeKey);
    await onBusy(async () => {
      onNotice(null);
      if (maxAmountRial == null && maxWeightGrams == null) {
        if (existing?.id) await tradingApi.deleteLimit(existing.id);
      } else {
        await tradingApi.upsertLimit({
          scope: 'CUSTOMER_TYPE',
          scopeKey,
          enabled: true,
          maxAmountRial,
          maxWeightGrams,
          maxCount: null,
        });
      }
      await limits.mutate();
    });
  };

  const openCustomer = (customer: StaffCustomer, existing?: TradingCustomerLimitRow | null) => {
    setCustomerDraft({
      customerId: customer.id,
      name: customer.fullName || `${customer.firstName} ${customer.lastName}`.trim(),
      typeLabel: existing?.customer?.typeLabel ?? null,
      amount: tomanField(existing?.maxAmountRial ?? null),
      weight: weightField(existing?.maxWeightGrams ?? null),
      existingId: existing?.id ?? null,
    });
    setSearch('');
    setResults([]);
  };

  const openExisting = (row: TradingCustomerLimitRow) => {
    setCustomerDraft({
      customerId: row.scopeKey,
      name: row.customer?.name ?? row.scopeKey,
      typeLabel: row.customer?.typeLabel ?? null,
      amount: tomanField(row.maxAmountRial),
      weight: weightField(row.maxWeightGrams),
      existingId: row.id,
    });
  };

  const saveCustomer = async (event: FormEvent) => {
    event.preventDefault();
    if (!customerDraft) return;
    const maxAmountRial = rialOrNull(customerDraft.amount);
    const maxWeightGrams = weightOrNull(customerDraft.weight);
    await onBusy(async () => {
      onNotice(null);
      if (maxAmountRial == null && maxWeightGrams == null) {
        if (customerDraft.existingId) await tradingApi.deleteLimit(customerDraft.existingId);
      } else {
        await tradingApi.upsertLimit({
          scope: 'CUSTOMER',
          scopeKey: customerDraft.customerId,
          enabled: true,
          maxAmountRial,
          maxWeightGrams,
          maxCount: null,
        });
      }
      setCustomerDraft(null);
      await limits.mutate();
    });
  };

  const removeCustomer = async (id: string) => {
    await onBusy(async () => {
      onNotice(null);
      await tradingApi.deleteLimit(id);
      await limits.mutate();
    });
  };

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      void internalCustomersApi
        .list({ search: q, limit: 8, page: 1 })
        .then((page) => {
          if (!cancelled) setResults(page.items);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  if (limits.isLoading) return <SkeletonBlock className="h-40" />;
  if (limits.error) return <ApiErrorState error={limits.error} onRetry={() => void limits.mutate()} />;

  const customerLimits = limits.data?.customerLimits ?? [];
  const groupLimits = (limits.data?.groupLimits ?? []).filter(
    (row) => row.scopeKey === 'HOUSEHOLD' || row.scopeKey === 'PARTNER' || row.scopeKey === 'VIP',
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">سقف بر اساس گروه مشتری</CardTitle>
          <p className="text-xs text-muted-foreground">
            این سقف برای هر فرد در گروه، جداگانه در همان بازه معاملاتی اعمال می‌شود. خالی بگذارید تا
            سقف گروهی نداشته باشد.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-right text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-medium">گروه</th>
                <th className="px-3 py-3 font-medium">سقف مبلغ (تومان)</th>
                <th className="px-3 py-3 font-medium">سقف وزن (گرم)</th>
                <th className="px-3 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {groupLimits.map((row) => {
                const draft = drafts[row.scopeKey] ?? { amount: '', weight: '' };
                return (
                  <tr key={row.scopeKey} className="border-t">
                    <td className="px-3 py-2 font-medium">{row.label}</td>
                    <td className="px-3 py-2">
                      <Input
                        dir="ltr"
                        className="h-9"
                        value={draft.amount}
                        disabled={!canEdit || busy}
                        placeholder="بدون سقف"
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [row.scopeKey]: { ...draft, amount: formatGroupedPersianInteger(event.target.value) },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        dir="ltr"
                        className="h-9"
                        value={draft.weight}
                        disabled={!canEdit || busy}
                        placeholder="بدون سقف"
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [row.scopeKey]: { ...draft, weight: formatGroupedPersianDecimal(event.target.value) },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      {canEdit ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            void saveGroup(row.scopeKey).catch((error: unknown) => {
                              onNotice(error instanceof Error ? error.message : 'ثبت سقف گروه انجام نشد.');
                            });
                          }}
                        >
                          ذخیره
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">سقف فردی مشتریان</CardTitle>
          <p className="text-xs text-muted-foreground">
            سقف فردی جایگزین سقف گروه همان مشتری می‌شود. در غیر این صورت سقف گروه اعمال می‌گردد.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          {canEdit ? (
            <div className="relative space-y-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="جستجوی مشتری با نام، موبایل یا کد"
                disabled={busy}
              />
              {searching ? <p className="text-xs text-muted-foreground">در حال جستجو…</p> : null}
              {results.length > 0 ? (
                <ul className="rounded-lg border bg-white shadow-sm">
                  {results.map((customer) => {
                    const existing = customerLimits.find((row) => row.scopeKey === customer.id);
                    return (
                      <li key={customer.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-right text-sm hover:bg-muted/60"
                          onClick={() => openCustomer(customer, existing)}
                        >
                          <span>
                            {customer.fullName || `${customer.firstName} ${customer.lastName}`}
                            <span className="mr-2 text-xs text-muted-foreground" dir="ltr">
                              {formatMobile(customer.mobile)}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {existing ? 'ویرایش سقف' : 'تعریف سقف'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-right text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 font-medium">مشتری</th>
                  <th className="px-3 py-3 font-medium">گروه</th>
                  <th className="px-3 py-3 font-medium">سقف مبلغ</th>
                  <th className="px-3 py-3 font-medium">سقف وزن</th>
                  <th className="px-3 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {customerLimits.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-muted-foreground" colSpan={5}>
                      هنوز سقف فردی تعریف نشده است.
                    </td>
                  </tr>
                ) : (
                  customerLimits.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2">
                        <div>{row.customer?.name ?? row.scopeKey}</div>
                        {row.customer?.mobile ? (
                          <div className="text-xs text-muted-foreground" dir="ltr">
                            {formatMobile(row.customer.mobile)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{row.customer?.typeLabel ?? '—'}</td>
                      <td className="px-3 py-2">{moneyDisplay(row.maxAmountRial)}</td>
                      <td className="px-3 py-2">{gramsDisplay(row.maxWeightGrams)}</td>
                      <td className="px-3 py-2">
                        {canEdit ? (
                          <div className="flex flex-wrap gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => openExisting(row)}
                            >
                              ویرایش
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => {
                                void removeCustomer(row.id).catch((error: unknown) => {
                                  onNotice(
                                    error instanceof Error ? error.message : 'حذف سقف انجام نشد.',
                                  );
                                });
                              }}
                            >
                              حذف
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={customerDraft != null}
        onClose={() => setCustomerDraft(null)}
        title="سقف فردی مشتری"
      >
        {customerDraft ? (
          <form className="space-y-4" onSubmit={(event) => void saveCustomer(event).catch((error: unknown) => {
            onNotice(error instanceof Error ? error.message : 'ثبت سقف فردی انجام نشد.');
          })}>
            <div>
              <p className="font-medium">{customerDraft.name}</p>
              {customerDraft.typeLabel ? (
                <p className="text-xs text-muted-foreground">گروه: {customerDraft.typeLabel}</p>
              ) : null}
            </div>
            <label className="block space-y-1 text-sm">
              <span>سقف مبلغ (تومان)</span>
              <Input
                dir="ltr"
                value={customerDraft.amount}
                disabled={busy}
                placeholder="بدون سقف"
                onChange={(event) =>
                  setCustomerDraft((current) =>
                    current
                      ? { ...current, amount: formatGroupedPersianInteger(event.target.value) }
                      : current,
                  )
                }
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>سقف وزن (گرم)</span>
              <Input
                dir="ltr"
                value={customerDraft.weight}
                disabled={busy}
                placeholder="بدون سقف"
                onChange={(event) =>
                  setCustomerDraft((current) =>
                    current
                      ? { ...current, weight: formatGroupedPersianDecimal(event.target.value) }
                      : current,
                  )
                }
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setCustomerDraft(null)}>
                انصراف
              </Button>
              <Button type="submit" disabled={busy}>
                ذخیره
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
