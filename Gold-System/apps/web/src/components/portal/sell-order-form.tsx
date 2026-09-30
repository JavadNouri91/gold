'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import useSWR from 'swr';
import { pricingApi, ordersApi, customerApi, ApiClientError } from '@/lib/api';
import { toPricingView, type PricingView } from '@/lib/pricing-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { subtractDecimal } from '@/lib/decimal-string';
import { formatRial, formatGrams, isPositiveDecimal } from '@/lib/utils';

interface OrderForm {
  weightGrams: string;
  purityRatio: string;
}

const PURITY_OPTIONS = [
  { value: '0.999000', label: '۲۴ عیار (۹۹۹)' },
  { value: '0.916000', label: '۲۲ عیار (۹۱۶)' },
  { value: '0.750000', label: '۱۸ عیار (۷۵۰)' },
  { value: '0.585000', label: '۱۴ عیار (۵۸۵)' },
];

type Step = 'form' | 'preview' | 'confirm' | 'submitted';

export function SellOrderForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('form');
  const [calcResult, setCalcResult] = useState<PricingView | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  const { data: currentPrice } = useSWR('pricing/current-price', () => pricingApi.getCurrentPrice());
  const { data: account } = useSWR('customer/me/account', () => customerApi.getMyAccount());
  const { data: customer } = useSWR('customer/me', () => customerApi.getMe());

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<OrderForm>({
    defaultValues: { purityRatio: '0.750000' },
  });

  const handleCalculate = async (data: OrderForm) => {
    setError(null);
    setIsCalculating(true);
    try {
      const result = await pricingApi.calculate({
        weightGrams: data.weightGrams,
        purityRatio: data.purityRatio,
        ...(customer?.type ? { customerType: customer.type } : {}),
        ...(currentPrice?.snapshotId ? { priceSnapshotId: currentPrice.snapshotId } : {}),
      });
      setCalcResult(toPricingView(result));
      setStep('preview');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('خطا در محاسبه قیمت');
      }
    } finally {
      setIsCalculating(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (!calcResult) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const formData = getValues();
      const order = await ordersApi.create({
        weightGrams: formData.weightGrams,
        purityRatio: formData.purityRatio,
        ...(calcResult.snapshotId ? { priceSnapshotId: calcResult.snapshotId } : {}),
        side: 'SELL',
      });
      await ordersApi.submit(order.id);
      setCreatedOrderId(order.id);
      setStep('submitted');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('خطا در ثبت سفارش');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === 'submitted' && createdOrderId) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center py-8">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-green-700">سفارش با موفقیت ثبت شد</h1>
          <p className="text-muted-foreground mt-2">سفارش شما دریافت شد و در حال بررسی است.</p>
        </div>
        <Alert variant="info">
          <p>پس از بررسی سفارش، یک پیشنهاد قیمت برای شما صادر می‌شود و از طریق پیامک اطلاع‌رسانی خواهید شد.</p>
        </Alert>
        <div className="flex gap-3">
          <Button onClick={() => router.push(`/portal/orders/${createdOrderId}`)}>مشاهده سفارش</Button>
          <Button variant="outline" onClick={() => router.push('/portal/orders')}>لیست سفارش‌ها</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">فروش طلا</h1>
      </div>

      {currentPrice && (
        <Card className="bg-gold-50 border-gold-200">
          <CardContent className="py-3">
            <p className="text-sm text-gold-800">
              قیمت لحظه‌ای: <span className="font-bold tabular-nums">{formatRial(currentPrice.normalizedValue)} / گرم</span>
              <span className="text-xs mr-2 text-gold-600">
                ({new Date(currentPrice.capturedAt).toLocaleTimeString('fa-IR')})
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      {step === 'form' && (
        <Card>
          <CardHeader>
            <CardTitle>مشخصات سفارش</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(handleCalculate)} noValidate className="space-y-4">
              <Input
                label="وزن (گرم)"
                placeholder="مثال: ۵"
                dir="ltr"
                type="number"
                step="0.001"
                min="0.001"
                error={errors.weightGrams?.message}
                {...register('weightGrams', {
                  required: 'وزن الزامی است',
                  validate: (v) => isPositiveDecimal(v) || 'وزن باید عددی مثبت باشد',
                })}
              />

              <div className="space-y-1">
                <label className="block text-sm font-medium">عیار</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                  {...register('purityRatio', { required: 'عیار الزامی است' })}
                >
                  {PURITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <Button type="submit" className="w-full" isLoading={isCalculating}>
                محاسبه قیمت
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 'preview' && calcResult && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>جزئیات محاسبه قیمت</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border text-sm">
                <PriceRow label="وزن" value={formatGrams(getValues().weightGrams)} />
                <PriceRow label="قیمت پایه" value={formatRial(calcResult.basePricePerGram)} />
                {calcResult.wageAmount ? <PriceRow label="اجرت ساخت" value={formatRial(calcResult.wageAmount)} /> : null}
                {calcResult.profitAmount ? <PriceRow label="سود فروشنده" value={formatRial(calcResult.profitAmount)} /> : null}
                {calcResult.taxAmount ? <PriceRow label="مالیات" value={formatRial(calcResult.taxAmount)} /> : null}
                {calcResult.discountAmount ? (
                  <PriceRow label="تخفیف" value={`−${formatRial(calcResult.discountAmount)}`} />
                ) : null}
                <PriceRow label="مبلغ نهایی" value={formatRial(calcResult.finalPrice)} highlight />
              </dl>
            </CardContent>
          </Card>

          {account && (
            <Alert variant="info">
              <p className="font-medium mb-1">تأثیر بر اعتبار</p>
              <p className="text-sm">
                با ثبت این سفارش، مبلغ{' '}
                <span className="font-bold">{formatRial(calcResult.finalPrice)}</span>{' '}
                از اعتبار شما رزرو خواهد شد.
              </p>
              <p className="text-sm mt-1">
                اعتبار در دسترس پس از ثبت:{' '}
                <span className="font-bold tabular-nums">
                  {formatRial(subtractDecimal(account.availableCreditRial, calcResult.finalPrice))}
                </span>
              </p>
            </Alert>
          )}

          <Alert variant="warning">
            با ثبت سفارش، مبلغ مربوطه از اعتبار شما رزرو خواهد شد. این سفارش تضمین‌کننده معامله قطعی نیست و نیاز به بررسی و تأیید دارد.
          </Alert>

          <div className="flex gap-3">
            <Button className="flex-1" onClick={() => setStep('confirm')}>
              تأیید و ثبت سفارش
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setStep('form');
                setCalcResult(null);
                setError(null);
              }}
            >
              اصلاح
            </Button>
          </div>
        </div>
      )}

      {step === 'confirm' && calcResult && (
        <div className="space-y-4">
          <Alert variant="warning" title="تأیید نهایی سفارش">
            <p>آیا از ثبت این سفارش اطمینان دارید؟</p>
            <p className="mt-1">مبلغ <strong>{formatRial(calcResult.finalPrice)}</strong> از اعتبار شما رزرو خواهد شد.</p>
          </Alert>
          <div className="flex gap-3">
            <Button className="flex-1" onClick={handleConfirmOrder} isLoading={isSubmitting}>
              بله، سفارش را ثبت کن
            </Button>
            <Button variant="outline" onClick={() => setStep('preview')} disabled={isSubmitting}>
              بازگشت
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PriceRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between py-2.5 ${highlight ? 'font-bold text-base' : ''}`}>
      <dt className={highlight ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
