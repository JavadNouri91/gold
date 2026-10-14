'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/dashboard/page-header';
import { Toast } from '@/components/dashboard/customer-widgets';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiClientError, pricingApi, type FeePolicy } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import {
  CUSTOMER_TYPE_LABELS,
  formatGroupedPersianInteger,
  toLatinDigits,
  toPersianDigits,
} from '@/lib/utils';

const TYPES = ['HOUSEHOLD', 'PARTNER', 'VIP', null] as const;
const SIDES = ['BUY', 'SELL'] as const;

const SIDE_LABEL: Record<string, string> = {
  BUY: 'کارمزد خرید',
  SELL: 'کارمزد فروش',
};

const BASE_LABEL: Record<string, string> = {
  GOLD_VALUE_STEP4: 'مبلغ طلا (گام ۴)',
  AFTER_GROUP_RULE_STEP5: 'پس از تعدیل گروهی (گام ۵)',
  GOLD_COMMERCIAL_TOTAL: 'مبلغ تجاری طلا (نهایی قیمت)',
};

const MODE_LABEL: Record<string, string> = {
  NONE: 'غیرفعال',
  FIXED: 'مبلغ ثابت (ریال)',
  PERCENTAGE: 'درصدی',
};

type CellKey = string;

function cellKey(type: string | null, side: string): CellKey {
  return `${type ?? 'DEFAULT'}|${side}`;
}

function typeLabel(type: string | null) {
  if (!type) return 'پیش‌فرض (همه)';
  return CUSTOMER_TYPE_LABELS[type] ?? type;
}

function messageOf(error: unknown) {
  return error instanceof ApiClientError ? error.message : 'ذخیره انجام نشد.';
}

export function FeePoliciesPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user?.permissions, 'pricing.fees.manage');
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success');
  const [saving, setSaving] = useState<CellKey | null>(null);

  const { data, error, isLoading, mutate } = useSWR(
    canManage ? 'fee-policies' : null,
    () => pricingApi.listFeePolicies(),
  );

  const byCell = useMemo(() => {
    const map = new Map<CellKey, FeePolicy>();
    for (const p of data ?? []) {
      map.set(cellKey(p.customerType, p.side), p);
    }
    return map;
  }, [data]);

  const notify = (message: string, tone: 'success' | 'error' = 'success') => {
    setToastTone(tone);
    setToast(message);
  };

  if (!canManage) return <ForbiddenNotice permission="pricing.fees.manage" />;

  async function saveCell(
    type: string | null,
    side: 'BUY' | 'SELL',
    draft: {
      mode: 'NONE' | 'FIXED' | 'PERCENTAGE';
      value: string;
      calculationBase: string | null;
      enabled: boolean;
      labelFa: string;
    },
  ) {
    const key = cellKey(type, side);
    setSaving(key);
    try {
      const existing = byCell.get(key);
      if (draft.mode === 'PERCENTAGE' && !draft.calculationBase) {
        throw new Error('برای کارمزد درصدی باید پایه محاسبه انتخاب شود.');
      }
      if ((draft.mode === 'FIXED' || draft.mode === 'NONE') && draft.calculationBase) {
        draft = { ...draft, calculationBase: null };
      }

      if (existing) {
        await pricingApi.updateFeePolicy(existing.id, {
          mode: draft.mode,
          value: draft.value || '0',
          calculationBase: draft.mode === 'PERCENTAGE' ? draft.calculationBase : null,
          enabled: draft.enabled,
          labelFa: draft.labelFa,
          status: 'ACTIVE',
        });
      } else {
        await pricingApi.createFeePolicy({
          ...(type ? { customerType: type } : { customerType: null }),
          side,
          mode: draft.mode,
          value: draft.value || '0',
          calculationBase:
            draft.mode === 'PERCENTAGE'
              ? draft.calculationBase ?? 'GOLD_COMMERCIAL_TOTAL'
              : undefined,
          enabled: draft.enabled,
          labelFa: draft.labelFa || SIDE_LABEL[side],
          activeFrom: new Date().toISOString(),
        });
      }
      await mutate();
      notify('تنظیمات کارمزد ذخیره شد.');
    } catch (e) {
      notify(messageOf(e), 'error');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="کارمزد معاملات"
        description="تنظیم کارمزد خرید و فروش به‌ازای نوع مشتری — مستقل از اجرت و قیمت طلا"
      />

      <Alert variant="info">
        کارمزد از قیمت طلا و اجرت جدا است. برای فروش، کارمزد از مبلغ دریافتی کسر می‌شود و اعتبار ریالی رزرو
        نمی‌شود.
      </Alert>

      {error ? (
        <Alert variant="error">بارگذاری سیاست‌های کارمزد ناموفق بود.</Alert>
      ) : null}

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-white" />
      ) : (
        <div className="grid gap-4">
          {TYPES.map((type) => (
            <Card key={type ?? 'DEFAULT'}>
              <CardHeader>
                <CardTitle>{typeLabel(type)}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {SIDES.map((side) => {
                  const key = cellKey(type, side);
                  const policy = byCell.get(key);
                  return (
                    <FeeCell
                      key={key}
                      side={side}
                      policy={policy}
                      saving={saving === key}
                      onSave={(draft) => saveCell(type, side, draft)}
                    />
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {toast ? (
        <Toast message={toast} tone={toastTone} onClose={() => setToast(null)} />
      ) : null}
    </div>
  );
}

function FeeCell({
  side,
  policy,
  saving,
  onSave,
}: {
  side: 'BUY' | 'SELL';
  policy?: FeePolicy;
  saving: boolean;
  onSave: (draft: {
    mode: 'NONE' | 'FIXED' | 'PERCENTAGE';
    value: string;
    calculationBase: string | null;
    enabled: boolean;
    labelFa: string;
  }) => void;
}) {
  const [mode, setMode] = useState<'NONE' | 'FIXED' | 'PERCENTAGE'>(policy?.mode ?? 'NONE');
  const [value, setValue] = useState(policy?.value ?? '0');
  const [base, setBase] = useState(policy?.calculationBase ?? 'GOLD_COMMERCIAL_TOTAL');
  const [enabled, setEnabled] = useState(policy?.enabled ?? true);
  const [labelFa, setLabelFa] = useState(policy?.labelFa ?? SIDE_LABEL[side]);

  return (
    <section className="rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-[#202124]">{SIDE_LABEL[side]}</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          فعال
        </label>
      </div>

      <label className="mt-3 block text-sm text-[#6B7280]">
        برچسب
        <input
          className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm"
          value={labelFa}
          onChange={(e) => setLabelFa(e.target.value)}
        />
      </label>

      <label className="mt-3 block text-sm text-[#6B7280]">
        نوع محاسبه
        <select
          className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm"
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
        >
          {Object.entries(MODE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>

      {mode !== 'NONE' ? (
        <label className="mt-3 block text-sm text-[#6B7280]">
          {mode === 'PERCENTAGE' ? 'درصد' : 'مبلغ (ریال)'}
          <input
            className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-left text-sm"
            dir="ltr"
            inputMode={mode === 'PERCENTAGE' ? 'decimal' : 'numeric'}
            value={
              !value
                ? ''
                : mode === 'FIXED'
                  ? formatGroupedPersianInteger(value)
                  : toPersianDigits(value)
            }
            onChange={(e) => {
              const latin = toLatinDigits(e.target.value);
              if (mode === 'FIXED') {
                setValue(latin.replace(/\D/g, ''));
                return;
              }
              const cleaned = latin.replace(/[^\d.]/g, '');
              const dot = cleaned.indexOf('.');
              setValue(
                dot === -1
                  ? cleaned
                  : `${cleaned.slice(0, dot + 1)}${cleaned.slice(dot + 1).replace(/\./g, '')}`,
              );
            }}
          />
        </label>
      ) : null}

      {mode === 'PERCENTAGE' ? (
        <label className="mt-3 block text-sm text-[#6B7280]">
          پایه محاسبه
          <select
            className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          >
            {Object.entries(BASE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {policy ? (
        <p className="mt-2 text-xs text-[#9CA3AF]">
          اولویت {toPersianDigits(String(policy.priority))} · وضعیت {policy.status}
        </p>
      ) : (
        <p className="mt-2 text-xs text-[#9CA3AF]">هنوز سیاستی ذخیره نشده (کارمزد صفر)</p>
      )}

      <Button
        type="button"
        className="mt-3 h-10 w-full"
        disabled={saving}
        onClick={() =>
          onSave({
            mode,
            value,
            calculationBase: mode === 'PERCENTAGE' ? base : null,
            enabled,
            labelFa,
          })
        }
      >
        {saving ? 'در حال ذخیره...' : 'ذخیره'}
      </Button>
    </section>
  );
}
