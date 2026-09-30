'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DatePickerJalali } from '@/components/ui/date-picker-jalali';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { ApiClientError } from '@/lib/api';
import type { TradingMarker, TradingSessionBody, TradingSessionView } from '@/lib/internal-api';
import { toLatinDigits } from '@/lib/utils';
import { WEEKDAYS } from './trading-widgets';

export interface SessionDraft {
  mode: 'create' | 'edit' | 'limits';
  session?: TradingSessionView;
  weekday?: string;
}

function field(value: string | null | undefined): string {
  return value ?? '';
}

function numberOrNull(value: string): string | null {
  const text = toLatinDigits(value).replace(/,/g, '').replace(/\s/g, '').trim();
  if (!text) return null;
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error('مقدار عددی نامعتبر است.');
  }
  return text;
}

function minutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function SessionDialog({
  draft,
  busy,
  onClose,
  onSubmit,
}: {
  draft: SessionDraft | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: TradingSessionBody, sessionId?: string) => Promise<void>;
}) {
  const session = draft?.session;
  const [title, setTitle] = useState(session?.title ?? '');
  const [weekday, setWeekday] = useState(session?.weekday ?? draft?.weekday ?? 'SATURDAY');
  const [startTime, setStartTime] = useState(session?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(session?.endTime ?? '13:00');
  const [enabled, setEnabled] = useState(session?.enabled ?? true);
  const [maxAmount, setMaxAmount] = useState(field(session?.maxAmountRial));
  const [usedCountCap, setUsedCountCap] = useState(field(session?.maxCount == null ? '' : String(session.maxCount)));
  const [maxWeight, setMaxWeight] = useState(field(session?.maxWeightGrams));
  const [minAmount, setMinAmount] = useState(field(session?.minAmountRial));
  const [maxSingleAmount, setMaxSingleAmount] = useState(field(session?.maxSingleAmountRial));
  const [minWeight, setMinWeight] = useState(field(session?.minWeightGrams));
  const [maxSingleWeight, setMaxSingleWeight] = useState(field(session?.maxSingleWeightGrams));
  const [error, setError] = useState<string | null>(null);

  const limitsOnly = draft?.mode === 'limits';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (!limitsOnly) {
        const start = minutes(startTime);
        const end = minutes(endTime);
        if (start == null || end == null || start >= end) {
          throw new Error('زمان پایان باید بعد از زمان شروع باشد.');
        }
        if (!title.trim()) throw new Error('عنوان بازه الزامی است.');
      }
      const body: TradingSessionBody = {
        maxAmountRial: numberOrNull(maxAmount),
        maxCount: usedCountCap.trim() ? Number(numberOrNull(usedCountCap)) : null,
        maxWeightGrams: numberOrNull(maxWeight),
        minAmountRial: numberOrNull(minAmount),
        maxSingleAmountRial: numberOrNull(maxSingleAmount),
        minWeightGrams: numberOrNull(minWeight),
        maxSingleWeightGrams: numberOrNull(maxSingleWeight),
      };
      const hasLimit = Object.values(body).some((value) => value != null && value !== '');
      if (!hasLimit) throw new Error('حداقل یکی از سقف‌ها باید تعیین شود.');
      if (!limitsOnly) {
        body.title = title.trim();
        body.weekday = weekday;
        body.startTime = startTime;
        body.endTime = endTime;
        body.enabled = enabled;
      }
      await onSubmit(body, session?.id);
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : 'ثبت بازه انجام نشد.');
    }
  };

  return (
    <Modal
      open={draft != null}
      onClose={onClose}
      title={limitsOnly ? 'ویرایش محدودیت بازه' : draft?.mode === 'edit' ? 'ویرایش بازه معاملاتی' : 'بازه معاملاتی جدید'}
      className="max-h-[90vh] max-w-2xl overflow-y-auto"
    >
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
        {limitsOnly ? null : (
          <>
            <Input label="عنوان بازه" value={title} onChange={(event) => setTitle(event.target.value)} required />
            <label className="space-y-1 text-sm">
              <span className="font-medium">روز</span>
              <select
                className="flex h-10 w-full rounded-md border bg-background px-3"
                value={weekday}
                onChange={(event) => setWeekday(event.target.value)}
              >
                {WEEKDAYS.map((day) => (
                  <option key={day.id} value={day.id}>{day.label}</option>
                ))}
              </select>
            </label>
            <Input label="زمان شروع" type="time" dir="ltr" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
            <Input label="زمان پایان" type="time" dir="ltr" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
              بازه فعال است
            </label>
          </>
        )}
        <Input label="سقف مبلغ معاملات" dir="ltr" value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} hint="ریال" />
        <Input label="سقف وزن طلا" dir="ltr" value={maxWeight} onChange={(event) => setMaxWeight(event.target.value)} hint="گرم" />
        <Input label="سقف تعداد معاملات" dir="ltr" value={usedCountCap} onChange={(event) => setUsedCountCap(event.target.value)} />
        <Input label="حداقل مبلغ معامله" dir="ltr" value={minAmount} onChange={(event) => setMinAmount(event.target.value)} hint="ریال" />
        <Input label="حداکثر مبلغ معامله" dir="ltr" value={maxSingleAmount} onChange={(event) => setMaxSingleAmount(event.target.value)} hint="ریال" />
        <Input label="حداقل وزن" dir="ltr" value={minWeight} onChange={(event) => setMinWeight(event.target.value)} hint="گرم" />
        <Input label="حداکثر وزن" dir="ltr" value={maxSingleWeight} onChange={(event) => setMaxSingleWeight(event.target.value)} hint="گرم" />
        {error ? <p className="text-sm text-red-600 sm:col-span-2">{error}</p> : null}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
          <Button type="submit" isLoading={busy}>ذخیره</Button>
        </div>
      </form>
    </Modal>
  );
}

export function OverrideDialog({
  open,
  marker,
  date,
  busy,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  marker: TradingMarker | null;
  date: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: {
    date: string;
    kind: 'FULL_CLOSURE' | 'SPECIAL_SCHEDULE';
    title: string;
    enabled: boolean;
    startTime?: string | null;
    endTime?: string | null;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const session = marker?.sessions[0];
  const [valueDate, setDate] = useState(marker?.date ?? date);
  const [kind, setKind] = useState<'FULL_CLOSURE' | 'SPECIAL_SCHEDULE'>(marker?.kind ?? 'FULL_CLOSURE');
  const [title, setTitle] = useState(marker?.title ?? '');
  const [enabled, setEnabled] = useState(marker?.enabled ?? true);
  const [startTime, setStartTime] = useState(session?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(session?.endTime ?? '13:00');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (!title.trim()) throw new Error('عنوان یا دلیل الزامی است.');
      if (kind === 'SPECIAL_SCHEDULE') {
        const start = minutes(startTime);
        const end = minutes(endTime);
        if (start == null || end == null || start >= end) {
          throw new Error('زمان پایان باید بعد از زمان شروع باشد.');
        }
      }
      await onSubmit({
        date: valueDate,
        kind,
        title: title.trim(),
        enabled,
        startTime: kind === 'SPECIAL_SCHEDULE' ? startTime : null,
        endTime: kind === 'SPECIAL_SCHEDULE' ? endTime : null,
      });
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : 'ثبت استثنا انجام نشد.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="تعطیلی یا برنامه اختصاصی" className="max-w-lg">
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <DatePickerJalali label="تاریخ" value={valueDate} onChange={setDate} allowFuture required />
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium">نوع</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="kind" checked={kind === 'FULL_CLOSURE'} onChange={() => setKind('FULL_CLOSURE')} />
            تعطیلی کامل
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="kind" checked={kind === 'SPECIAL_SCHEDULE'} onChange={() => setKind('SPECIAL_SCHEDULE')} />
            برنامه اختصاصی
          </label>
        </fieldset>
        <Input label="عنوان / دلیل" value={title} onChange={(event) => setTitle(event.target.value)} required />
        {kind === 'SPECIAL_SCHEDULE' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="زمان شروع" type="time" dir="ltr" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            <Input label="زمان پایان" type="time" dir="ltr" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">در تعطیلی کامل، ثبت معامله برای این تاریخ مسدود می‌شود.</p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          فعال
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-wrap justify-between gap-2">
          {marker ? (
            <Button type="button" variant="destructive" onClick={() => void onDelete()} disabled={busy}>حذف</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
            <Button type="submit" isLoading={busy}>ذخیره</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function CopyDialog({
  session,
  busy,
  onClose,
  onSubmit,
}: {
  session: TradingSessionView | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (weekdays: string[]) => Promise<void>;
}) {
  const [days, setDays] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const choices = WEEKDAYS.filter((day) => day.id !== session?.weekday);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (days.length === 0) throw new Error('روز دیگری را برای کپی انتخاب کنید.');
      await onSubmit(days);
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : 'کپی انجام نشد.');
    }
  };

  return (
    <Modal open={session != null} onClose={onClose} title="کپی برنامه به روزهای دیگر">
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {choices.map((day) => (
            <label key={day.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={days.includes(day.id)}
                onChange={(event) => {
                  setDays((current) =>
                    event.target.checked ? [...current, day.id] : current.filter((item) => item !== day.id),
                  );
                }}
              />
              {day.label}
            </label>
          ))}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
          <Button type="submit" isLoading={busy}>کپی</Button>
        </div>
      </form>
    </Modal>
  );
}
