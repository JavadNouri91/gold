'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { ordersApi, pickupsApi, ApiClientError } from '@/lib/api';
import { toPortfolioPosition, isRegisteredHolding } from '@/lib/customer-portfolio';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSpinner } from '@/components/ui/spinner';
import { Alert } from '@/components/ui/alert';
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

export default function NewPickupPage() {
  const router = useRouter();
  const { data: holding, error: holdingError, isLoading } = useSWR('portal-portfolio', () =>
    ordersApi.portfolio(),
  );
  const position = toPortfolioPosition(holding);
  const available = isRegisteredHolding(position) ? position : null;

  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableGrams = available ? Number(toLatinDigits(available.weightGrams)) : 0;
  const quickWeights = QUICK_WEIGHTS_GRAMS.filter(
    (grams) => Number.isFinite(availableGrams) && grams <= availableGrams,
  );
  const selectedQuick = Number(toLatinDigits(weight).trim());

  const weightValidForPreview =
    /^[1-9]\d*$/.test(weight) && Number(weight) <= availableGrams;
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
      const pickup = await pickupsApi.create({
        weightGrams,
        purityRatio: PICKUP_PURITY_RATIO,
        customerNote: note.trim() || undefined,
        priceSnapshotId: feePreview?.priceSnapshotId ?? undefined,
      });
      router.push(`/portal/pickups/${pickup.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'ثبت درخواست ناموفق بود.');
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading && !holding) return <PageSpinner />;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">درخواست تحویل حضوری</h1>
        <Link href="/portal/pickups" className="text-sm text-muted-foreground hover:text-foreground">
          بازگشت
        </Link>
      </div>

      {holdingError ? <Alert variant="error">موجودی قابل دریافت نیست.</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">موجودی قابل درخواست</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-2xl font-bold tabular-nums">
            {available ? formatWeight(available.weightGrams) : '۰ گرم'}
          </p>
          <p className="text-muted-foreground">عیار ثابت {toPersianDigits('750')}</p>
          <p className="leading-7 text-muted-foreground">
            با ثبت درخواست، همین وزن از موجودی شما رزرو می‌شود و پس از آماده‌سازی می‌توانید در فروشگاه
            قالب آبشده را تحویل بگیرید.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input
              id="weight"
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
              id="note"
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
            <Button
              type="submit"
              className="w-full"
              disabled={!available || submitting || !canAfford}
            >
              {submitting ? 'در حال ثبت…' : 'ثبت درخواست و رزرو موجودی'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
