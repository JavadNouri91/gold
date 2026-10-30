'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { X } from 'lucide-react';
import { ApiClientError, ordersApi, pickupsApi, type PhysicalGoldPickup } from '@/lib/api';
import { isRegisteredHolding, toPortfolioPosition } from '@/lib/customer-portfolio';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import {
  cn,
  formatFeeRate,
  formatWeight,
  formatWholeMoney,
  toLatinDigits,
  toPersianDigits,
} from '@/lib/utils';

/** In-store molten-gold pickup is always millesimal 750. */
const PICKUP_PURITY_RATIO = '0.750000';

/** Quick-select bar sizes (grams). Only options ≤ available holding are shown. */
const QUICK_WEIGHTS_GRAMS = [10, 20, 50, 100, 200] as const;

/** Digits only — pickup weight is whole grams, never fractional. */
function normalizeIntegerGrams(raw: string): string {
  return toLatinDigits(raw).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}

export function NewPickupModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data: holding, error: holdingError, isLoading } = useSWR(
    open ? 'orders/portfolio' : null,
    () => ordersApi.portfolio(),
  );
  const position = toPortfolioPosition(holding);
  const available = isRegisteredHolding(position) ? position : null;

  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setWeight('');
    setNote('');
    setError(null);
    setSubmitting(false);
  }, [open]);

  const availableGrams = available ? Number(toLatinDigits(available.weightGrams)) : 0;
  const quickWeights = QUICK_WEIGHTS_GRAMS.filter(
    (grams) => Number.isFinite(availableGrams) && grams <= availableGrams,
  );
  const selectedQuick = Number(toLatinDigits(weight).trim());

  const weightValidForPreview = /^[1-9]\d*$/.test(weight) && Number(weight) <= availableGrams;
  const { data: feePreview } = useSWR(
    weightValidForPreview ? ['pickup-fee-preview', weight] : null,
    () => pickupsApi.feePreview({ weightGrams: weight }),
  );
  const canAfford = !feePreview || feePreview.canAfford;
  const shortfallRial = feePreview && !feePreview.canAfford ? feePreview.shortfallRial : null;

  function validateWeight(weightGrams: string): string | null {
    if (!weightGrams) {
      return 'وزن طلا را وارد کنید.';
    }
    if (!/^[1-9]\d*$/.test(weightGrams)) {
      return 'وزن باید عدد صحیح گرم و بیشتر از صفر باشد.';
    }
    if (!Number.isFinite(availableGrams) || availableGrams <= 0) {
      return 'موجودی قابل درخواست ندارید.';
    }
    if (Number(weightGrams) > availableGrams) {
      return `وزن درخواستی از موجودی قابل درخواست (${formatWeight(available!.weightGrams)}) بیشتر است.`;
    }
    return null;
  }

  function requestClose() {
    if (submitting) return;
    onClose();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const weightGrams = normalizeIntegerGrams(weight);
    const validationError = validateWeight(weightGrams);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const pickup: PhysicalGoldPickup = await pickupsApi.create({
        weightGrams,
        purityRatio: PICKUP_PURITY_RATIO,
        customerNote: note.trim() || undefined,
        priceSnapshotId: feePreview?.priceSnapshotId ?? undefined,
      });
      await Promise.all([
        mutate('portal-pickups'),
        mutate('orders/portfolio'),
        mutate('portal-portfolio'),
      ]);
      onClose();
      router.push(`/portal/pickups/${pickup.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'ثبت درخواست ناموفق بود.');
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={requestClose} className="max-w-lg overflow-hidden p-0">
      <div dir="rtl" className="flex max-h-[min(90vh,40rem)] flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 id="modal-title" className="text-base font-bold text-slate-900">
            درخواست تحویل حضوری
          </h2>
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="بستن"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <form className="flex-1 space-y-4 overflow-y-auto px-5 py-4" onSubmit={onSubmit}>
          {isLoading && !holding ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <>
              {holdingError ? <Alert variant="error">موجودی قابل دریافت نیست.</Alert> : null}

              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                <p className="text-xs text-amber-800/80">موجودی قابل درخواست</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-amber-950">
                  {available ? formatWeight(available.weightGrams) : '۰ گرم'}
                </p>
                <p className="mt-1 text-xs text-amber-800/80">
                  عیار ثابت {toPersianDigits('750')} — با ثبت درخواست، همین وزن از موجودی شما رزرو می‌شود.
                </p>
              </div>

              <Input
                id="pickup-weight"
                label="وزن (گرم)"
                dir="ltr"
                inputMode="numeric"
                value={weight ? toPersianDigits(weight) : ''}
                onChange={(e) => {
                  const next = normalizeIntegerGrams(e.target.value);
                  setWeight(next);
                  setError(next ? validateWeight(next) : null);
                }}
                placeholder={`مثلاً ${toPersianDigits('50')}`}
                disabled={!available || submitting}
                hint="فقط عدد صحیح گرم (بدون اعشار)"
              />

              {quickWeights.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">انتخاب سریع</p>
                  <div className="flex flex-wrap gap-2">
                    {quickWeights.map((grams) => {
                      const active = selectedQuick === grams;
                      return (
                        <button
                          key={grams}
                          type="button"
                          disabled={submitting}
                          onClick={() => {
                            setWeight(String(grams));
                            setError(null);
                          }}
                          className={cn(
                            'min-h-11 rounded-lg border px-3 text-sm font-medium tabular-nums transition-colors',
                            active
                              ? 'border-amber-500 bg-amber-50 text-amber-900'
                              : 'border-input bg-background text-foreground hover:border-amber-400 hover:bg-amber-50/60',
                            'disabled:cursor-not-allowed disabled:opacity-50',
                          )}
                        >
                          {toPersianDigits(String(grams))} گرم
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <Input
                id="pickup-note"
                label="یادداشت (اختیاری)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                disabled={submitting}
              />

              {feePreview ? (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">کارمزد تبدیل به فیزیکی</span>
                    <span className="font-medium tabular-nums">
                      {feePreview.mode === 'NONE'
                        ? 'رایگان'
                        : formatWholeMoney(feePreview.amountRial)}
                    </span>
                  </div>
                  {feePreview.mode !== 'NONE' ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">نوع کارمزد</span>
                        <span className="font-medium">
                          {formatFeeRate(feePreview.mode, feePreview.rateValue)
                            ? `${feePreview.labelFa} (${formatFeeRate(feePreview.mode, feePreview.rateValue)})`
                            : feePreview.labelFa}
                        </span>
                      </div>
                      {feePreview.mode === 'PERCENTAGE' ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">ارزش طلا (مبنای محاسبه)</span>
                          <span className="font-medium tabular-nums">
                            {formatWholeMoney(feePreview.baseAmountRial)}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">موجودی ریالی کیف پول</span>
                        <span className="font-medium tabular-nums">
                          {formatWholeMoney(feePreview.availableRial)}
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              {shortfallRial ? (
                <Alert variant="error">
                  موجودی ریالی کیف پول برای پرداخت کارمزد تبدیل کافی نیست. کمبود:{' '}
                  {formatWholeMoney(shortfallRial)}
                </Alert>
              ) : null}

              {error ? <Alert variant="error">{error}</Alert> : null}

              <div className="flex gap-3 pt-1">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={!available || submitting || !canAfford}
                >
                  {submitting ? 'در حال ثبت…' : 'ثبت درخواست و رزرو موجودی'}
                </Button>
                <Button type="button" variant="outline" onClick={requestClose} disabled={submitting}>
                  انصراف
                </Button>
              </div>
            </>
          )}
        </form>
      </div>
    </Modal>
  );
}
