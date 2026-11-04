'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { X } from 'lucide-react';
import {
  ApiClientError,
  ordersApi,
  pickupsApi,
  pricingApi,
  type PhysicalGoldPickup,
} from '@/lib/api';
import { isRegisteredHolding, toPortfolioPosition } from '@/lib/customer-portfolio';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuickAmountPills } from './QuickAmountPills';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { formatFeeRate, toLatinDigits, toPersianDigits } from '@/lib/utils';

/** In-store molten-gold pickup is always millesimal 750. */
const PICKUP_PURITY_RATIO = '0.750000';

function formatPickupMoney(rial: string | number): string {
  return `${Math.floor(Number(rial) / 10).toLocaleString('fa-IR')} تومان`;
}

export function NewPickupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const {
    data: holding,
    error: holdingError,
    isLoading,
  } = useSWR(open ? 'orders/portfolio' : null, () => ordersApi.portfolio());
  const position = toPortfolioPosition(holding);
  const available = isRegisteredHolding(position) ? position : null;

  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setWeight('');
    setNote('');
    setNoteOpen(false);
    setError(null);
    setSubmitting(false);
  }, [open]);

  const availableGrams = available ? Number(toLatinDigits(available.weightGrams)) : 0;
  const maxWholeGrams = Number.isFinite(availableGrams)
    ? Math.max(0, Math.floor(availableGrams))
    : 0;
  const { data: currentPrice } = useSWR(open ? 'pricing/current-price' : null, () =>
    pricingApi.getCurrentPrice(),
  );
  const weightValidForPreview =
    /^[1-9]\d*$/.test(weight) &&
    Number.isSafeInteger(Number(weight)) &&
    Number(weight) <= maxWholeGrams;
  const { data: feePreview, error: feeError } = useSWR(
    open && weightValidForPreview ? ['pickup-fee-preview', weight] : null,
    () => pickupsApi.feePreview({ weightGrams: weight }),
  );
  const canAfford = !feePreview || feePreview.canAfford;
  const shortfallRial = feePreview && !feePreview.canAfford ? feePreview.shortfallRial : null;

  const pricePerGram =
    feePreview?.goldPricePerGramRial ??
    (currentPrice?.validityStatus === 'VALID' ? currentPrice.normalizedValue : null);
  const goldValueRial =
    pricePerGram && Number.isFinite(Number(pricePerGram))
      ? Number(pricePerGram) * Number(weight)
      : null;

  function validateWeight(weightGrams: string): string | null {
    if (!weightGrams) {
      return 'وزن طلا را وارد کنید.';
    }
    if (!/^[1-9]\d*$/.test(weightGrams) || !Number.isSafeInteger(Number(weightGrams))) {
      return 'وزن باید عدد صحیح گرم و بیشتر از صفر باشد.';
    }
    if (!Number.isFinite(availableGrams) || availableGrams <= 0) {
      return 'موجودی قابل درخواست ندارید.';
    }
    if (Number(weightGrams) > maxWholeGrams) {
      return `وزن درخواستی نمی‌تواند بیشتر از سقف مجاز (${maxWholeGrams.toLocaleString('fa-IR')} گرم) باشد`;
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
    const weightGrams = weight;
    const validationError = validateWeight(weightGrams);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!feePreview || !canAfford || feeError) return;
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
                  {availableGrams.toLocaleString('fa-IR', { maximumFractionDigits: 6 })} گرم
                </p>
                <p className="mt-1 text-xs text-amber-800/80">
                  فقط اوزان کامل (شمش ۱ گرم به بالا) قابل تحویل هستند. با ثبت درخواست، وزن انتخابی
                  از موجودی شما رزرو می‌شود.
                </p>
              </div>

              <Input
                id="pickup-weight"
                label="وزن درخواستی (گرم)"
                dir="ltr"
                inputMode="numeric"
                value={weight ? toPersianDigits(weight) : ''}
                onChange={(e) => {
                  const next = toLatinDigits(e.target.value).trim();
                  setWeight(next);
                  setError(null);
                }}
                placeholder={`حداکثر ${maxWholeGrams.toLocaleString('fa-IR')} گرم`}
                error={weight ? (validateWeight(weight) ?? undefined) : undefined}
                aria-invalid={!!weight && !!validateWeight(weight)}
                disabled={!available || submitting}
                hint="فقط عدد صحیح گرم (بدون اعشار)"
              />

              <QuickAmountPills
                availableWeightGrams={availableGrams}
                value={Number(weight)}
                disabled={submitting || !!holdingError}
                onChange={(grams) => {
                  setWeight(String(grams));
                  setError(null);
                }}
              />

              {weightValidForPreview ? (
                <div
                  aria-live="polite"
                  className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span>ارزش طلای انتخابی (بر اساس نرخ روز طلا)</span>
                    <span className="font-semibold tabular-nums">
                      {goldValueRial == null
                        ? 'در انتظار نرخ طلا'
                        : formatPickupMoney(goldValueRial)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      کارمزد تبدیل فیزیکی
                      {feePreview
                        ? ` (${formatFeeRate(feePreview.mode, feePreview.rateValue) || 'رایگان'})`
                        : ''}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {feePreview ? formatPickupMoney(feePreview.amountRial) : 'در حال محاسبه…'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-amber-200 pt-3">
                    <span>مانده طلای کاربر پس از این تحویل</span>
                    <span className="font-semibold tabular-nums">
                      {(availableGrams - Number(weight)).toLocaleString('fa-IR', {
                        maximumFractionDigits: 6,
                      })}{' '}
                      گرم
                    </span>
                  </div>
                </div>
              ) : null}
              {feeError ? (
                <Alert variant="error">محاسبه کارمزد ممکن نشد. دوباره تلاش کنید.</Alert>
              ) : null}

              <button
                type="button"
                aria-expanded={noteOpen}
                aria-controls="pickup-note-panel"
                disabled={submitting}
                onClick={() => setNoteOpen(!noteOpen)}
                className="text-sm text-slate-600 hover:text-amber-800"
              >
                {noteOpen ? '− بستن یادداشت' : '+ افزودن یادداشت به سفارش'}
              </button>
              {noteOpen ? (
                <div id="pickup-note-panel">
                  <Input
                    id="pickup-note"
                    label="یادداشت (اختیاری)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                    disabled={submitting}
                  />
                </div>
              ) : null}

              {shortfallRial ? (
                <Alert variant="error">
                  موجودی ریالی کیف پول برای پرداخت کارمزد تبدیل کافی نیست. کمبود:{' '}
                  {formatPickupMoney(shortfallRial)}
                </Alert>
              ) : null}

              {error ? <Alert variant="error">{error}</Alert> : null}

              <div className="flex gap-3 pt-1">
                <Button
                  type="submit"
                  className="flex-1 bg-gradient-to-l from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700"
                  disabled={
                    !available ||
                    !!holdingError ||
                    submitting ||
                    !weightValidForPreview ||
                    !feePreview ||
                    !!feeError ||
                    !canAfford
                  }
                >
                  {submitting ? 'در حال ثبت…' : 'ثبت درخواست و رزرو موجودی'}
                </Button>
                <Button type="button" variant="ghost" onClick={requestClose} disabled={submitting}>
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
