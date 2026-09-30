'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { customerApi, ordersApi, pricingApi, type Order } from '@/lib/api';
import { compareDecimal, isZeroDecimal, subtractDecimal } from '@/lib/decimal-string';
import { toPricingView, type PricingView, basePriceDiffers } from '@/lib/pricing-view';
import {
  ORDER_STATUS_LABELS,
  cn,
  formatCountdown,
  formatMoney,
  formatPurity,
  formatRelativeTime,
  formatWeight,
  toPersianDigits,
} from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { purchaseErrorMessage } from './purchase-errors';
import { DEFAULT_PURITY, QUICK_WEIGHTS, TRADING_PURITIES, purityLabel } from './trading-purities';
import { canonicalWeight, isPositiveWeight, normalizeWeightInput } from './weight-input';

interface HeldQuote {
  view: PricingView;
  expiresAt: string | null;
  weightGrams: string;
  purityRatio: string;
}

interface DraftOrder {
  id: string;
  snapshotId: string;
  weightGrams: string;
  purityRatio: string;
}

export function BuyGoldPage() {
  const router = useRouter();
  const [weight, setWeight] = useState('');
  const [purity, setPurity] = useState(DEFAULT_PURITY);
  const [quote, setQuote] = useState<HeldQuote | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Order | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const submitLock = useRef(false);
  const draftRef = useRef<DraftOrder | null>(null);

  const price = useSWR('pricing/current-price', () => pricingApi.getCurrentPrice(), {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  });
  const account = useSWR('customer/me/account', () => customerApi.getMyAccount());
  const customer = useSWR('customer/me', () => customerApi.getMe());

  const countdownActive = Boolean(quote?.expiresAt);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), countdownActive ? 1000 : 10_000);
    return () => window.clearInterval(id);
  }, [countdownActive]);

  const grams = canonicalWeight(weight);
  const inputsMatch =
    quote != null && grams === quote.weightGrams && purity === quote.purityRatio;
  const liveSnapshot = price.data?.snapshotId;
  const priceMoved = Boolean(quote && liveSnapshot && liveSnapshot !== quote.view.snapshotId);
  const countdown = formatCountdown(quote?.expiresAt, now);
  const expired = Boolean(quote?.expiresAt) && countdown == null;
  const quoteBlocked = !inputsMatch || priceMoved || expired;

  const tradingReady =
    customer.data?.status === 'ACTIVE' &&
    (customer.data.accountStatus == null || customer.data.accountStatus === 'ACTIVE');
  const kycBlocked = customer.data != null && !tradingReady;
  const accountBlocked = tradingReady && account.data != null && account.data.status !== 'ACTIVE';

  const available = account.data?.availableCreditRial;
  const finalPrice = inputsMatch ? quote?.view.finalPrice : undefined;
  const creditShort =
    available != null && finalPrice != null && compareDecimal(available, finalPrice) < 0;
  const remaining =
    available != null && finalPrice != null && !creditShort
      ? subtractDecimal(available, finalPrice)
      : null;
  const shortfall =
    available != null && finalPrice != null && creditShort
      ? subtractDecimal(finalPrice, available)
      : null;

  const canConfirm =
    Boolean(quote) &&
    inputsMatch &&
    !priceMoved &&
    !expired &&
    accepted &&
    tradingReady &&
    !accountBlocked &&
    Boolean(account.data) &&
    !creditShort &&
    !calculating &&
    !submitting;

  async function runCalculate(nextWeight: string, nextPurity: string) {
    const nextGrams = canonicalWeight(nextWeight);
    if (!isPositiveWeight(nextGrams)) {
      setError(nextGrams === '' ? 'وزن باید عددی بزرگ‌تر از صفر باشد.' : null);
      return;
    }
    if (!TRADING_PURITIES.some((item) => item.value === nextPurity)) {
      setError('عیار انتخاب‌شده معتبر نیست.');
      return;
    }
    setCalculating(true);
    setError(null);
    setAccepted(false);
    setConfirmOpen(false);
    draftRef.current = null;
    try {
      const result = await pricingApi.calculate({
        weightGrams: nextGrams,
        purityRatio: nextPurity,
        ...(customer.data?.type ? { customerType: customer.data.type } : {}),
        ...(price.data?.snapshotId ? { priceSnapshotId: price.data.snapshotId } : {}),
      });
      const view = toPricingView(result);
      const expiresAt =
        price.data?.snapshotId && price.data.snapshotId === view.snapshotId
          ? (price.data.expiresAt ?? null)
          : null;
      setQuote({
        view,
        expiresAt,
        weightGrams: nextGrams,
        purityRatio: nextPurity,
      });
    } catch (err) {
      setQuote(null);
      setError(purchaseErrorMessage(err, 'محاسبه قیمت انجام نشد. لطفاً دوباره تلاش کنید.'));
    } finally {
      setCalculating(false);
    }
  }

  async function submitOrder() {
    if (!quote || !canConfirm || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const draft = draftRef.current;
      const reusable =
        draft != null &&
        draft.snapshotId === quote.view.snapshotId &&
        draft.weightGrams === grams &&
        draft.purityRatio === purity;
      const order = reusable
        ? { id: draft.id }
        : await ordersApi.create({
            weightGrams: grams,
            purityRatio: purity,
            priceSnapshotId: quote.view.snapshotId,
            side: 'BUY',
          });
      if (!reusable) {
        draftRef.current = {
          id: order.id,
          snapshotId: quote.view.snapshotId,
          weightGrams: grams,
          purityRatio: purity,
        };
      }
      const submitted = await ordersApi.submit(order.id);
      draftRef.current = null;
      setCreated(submitted);
      setConfirmOpen(false);
    } catch (err) {
      setError(purchaseErrorMessage(err, 'ثبت سفارش انجام نشد. لطفاً دوباره تلاش کنید.'));
      setConfirmOpen(false);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <PurchaseSuccess
        order={created}
        onView={() => router.push(`/portal/orders/${created.id}`)}
        onDashboard={() => router.push('/portal/dashboard')}
      />
    );
  }

  const activeQuote = inputsMatch ? quote : null;

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl pb-44 lg:pb-0">
      <LivePriceCard
        loading={price.isLoading && !price.data}
        error={Boolean(price.error) || (price.data != null && price.data.validityStatus !== 'VALID')}
        value={price.data?.normalizedValue}
        capturedAt={price.data?.capturedAt}
        now={now}
        refreshing={price.isValidating}
        onRefresh={() => void price.mutate()}
      />

      {error ? (
        <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#DC2626]">
          {error}
        </p>
      ) : null}

      {kycBlocked ? <KycBlock /> : null}
      {accountBlocked ? <AccountBlock /> : null}

      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-base font-bold text-[#202124]">مشخصات خرید</h2>
          <p className="mt-1 text-xs leading-6 text-[#6B7280]">طلای آبشده — وزن و عیار را وارد کنید.</p>

          <form
            className="mt-5 space-y-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void runCalculate(weight, purity);
            }}
          >
            <div>
              <label htmlFor="buy-weight" className="text-sm font-medium text-[#202124]">
                وزن طلا
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="buy-weight"
                  inputMode="decimal"
                  autoComplete="off"
                  enterKeyHint="done"
                  dir="ltr"
                  value={weight ? toPersianDigits(weight) : ''}
                  placeholder="مثال: ۵"
                  onChange={(event) => {
                    setWeight(normalizeWeightInput(event.target.value));
                    setAccepted(false);
                  }}
                  className="h-12 min-h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-lg tabular-nums text-[#202124] outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]"
                />
                <span className="shrink-0 text-sm text-[#6B7280]">گرم</span>
              </div>
              {weight && !isPositiveWeight(weight) ? (
                <p className="mt-1 text-xs text-[#DC2626]">وزن باید عددی بزرگ‌تر از صفر باشد.</p>
              ) : null}
            </div>

            <div className="min-w-0">
              <p className="text-sm font-medium text-[#202124]">مقدار سریع</p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {QUICK_WEIGHTS.map((value) => {
                  const selected = grams === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setWeight(value);
                        setAccepted(false);
                        void runCalculate(value, purity);
                      }}
                      className={cn(
                        'h-11 shrink-0 rounded-xl border px-4 text-sm font-medium',
                        selected
                          ? 'border-[#C8922E] bg-[#FFF8EB] text-[#92400E]'
                          : 'border-[#E5E7EB] bg-white text-[#202124]',
                      )}
                    >
                      {toPersianDigits(value)} گرم
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="buy-purity" className="text-sm font-medium text-[#202124]">
                عیار
              </label>
              <select
                id="buy-purity"
                value={purity}
                onChange={(event) => {
                  const next = event.target.value;
                  setPurity(next);
                  setAccepted(false);
                  if (isPositiveWeight(weight)) void runCalculate(weight, next);
                }}
                className="mt-2 h-12 min-h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#202124] outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]"
              >
                {TRADING_PURITIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" className="h-12 w-full" disabled={calculating}>
              {calculating ? 'در حال محاسبه...' : 'محاسبه قیمت'}
            </Button>
          </form>
        </section>

        <aside className="min-w-0 space-y-4">
          <PriceStatus
            hasQuote={Boolean(activeQuote)}
            unitPrice={activeQuote?.view.unitPricePerGram}
            calculating={calculating}
            priceMoved={priceMoved}
            expired={expired}
            countdown={countdown}
            onRefresh={() => void runCalculate(weight, purity)}
          />

          {calculating ? <BreakdownSkeleton /> : null}

          {activeQuote && !calculating ? (
            <>
              <Breakdown view={activeQuote.view} purity={purity} />
              <TotalCard amount={activeQuote.view.finalPrice} />
              <CreditCard
                loading={account.isLoading && !account.data}
                error={Boolean(account.error)}
                onRetry={() => void account.mutate()}
                available={available}
                orderAmount={activeQuote.view.finalPrice}
                remaining={remaining}
                shortfall={shortfall}
                insufficient={creditShort}
              />
              <OrderSummary view={activeQuote.view} purity={purity} />
            </>
          ) : !calculating ? (
            <section className="rounded-2xl border border-dashed border-[#E5E7EB] bg-white px-4 py-8 text-center text-sm text-[#6B7280]">
              وزن و عیار را وارد کنید تا مبلغ نهایی از سامانه محاسبه شود.
            </section>
          ) : null}

          <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 border-t border-[#E5E7EB] bg-white p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] lg:static lg:inset-auto lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            {activeQuote ? (
              <p className="mb-2 flex items-baseline justify-between gap-3 lg:hidden">
                <span className="text-xs text-[#6B7280]">مبلغ نهایی</span>
                <span className="text-base font-bold tabular-nums text-[#202124]">
                  {formatMoney(activeQuote.view.finalPrice)}
                </span>
              </p>
            ) : null}
            <label className="flex items-start gap-3 text-sm leading-6 text-[#202124]">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 accent-[#F59E0B]"
                checked={accepted}
                disabled={!activeQuote || quoteBlocked || kycBlocked || accountBlocked}
                onChange={(event) => setAccepted(event.target.checked)}
              />
              <span>
                قیمت نمایش داده شده و جزئیات سفارش را بررسی کرده‌ام و ثبت سفارش به منزله پذیرش قیمت فعلی است.
              </span>
            </label>
            <Button
              type="button"
              className="mt-3 h-12 w-full"
              disabled={!canConfirm}
              onClick={() => setConfirmOpen(true)}
            >
              تأیید و ثبت سفارش
            </Button>
          </div>
        </aside>
      </div>

      <HowOrderingWorks />

      <ConfirmPurchase
        open={confirmOpen}
        submitting={submitting}
        blocked={quoteBlocked}
        view={activeQuote?.view ?? null}
        purity={purity}
        onClose={() => {
          if (!submitting) setConfirmOpen(false);
        }}
        onConfirm={() => void submitOrder()}
      />
    </div>
  );
}

function LivePriceCard({
  loading,
  error,
  value,
  capturedAt,
  now,
  refreshing,
  onRefresh,
}: {
  loading: boolean;
  error: boolean;
  value?: string;
  capturedAt?: string;
  now: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#6B7280]">قیمت لحظه‌ای طلای آبشده</p>
          {loading ? (
            <div className="mt-3 h-9 w-48 animate-pulse rounded-lg bg-[#F3F4F6]" />
          ) : error || !value ? (
            <p className="mt-3 text-sm text-[#202124]">قیمت لحظه‌ای در دسترس نیست.</p>
          ) : (
            <p className="mt-2 text-2xl font-bold tabular-nums text-[#202124] md:text-3xl">
              {formatMoney(value)}
              <span className="mr-1 text-sm font-medium text-[#6B7280]">/ گرم</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[#C8922E]"
          aria-label="بروزرسانی قیمت"
        >
          <RefreshCw className={cn('h-5 w-5', refreshing && 'animate-spin')} />
        </button>
      </div>
      {!loading && !error && value ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-[#6B7280]">
          <span className="h-2 w-2 rounded-full bg-[#16A34A]" aria-hidden />
          آخرین بروزرسانی: {formatRelativeTime(capturedAt, now)}
        </p>
      ) : null}
      {error ? (
        <button type="button" onClick={onRefresh} className="mt-3 h-11 text-sm font-medium text-[#C8922E]">
          تلاش مجدد
        </button>
      ) : null}
    </section>
  );
}

function PriceStatus({
  hasQuote,
  unitPrice,
  calculating,
  priceMoved,
  expired,
  countdown,
  onRefresh,
}: {
  hasQuote: boolean;
  unitPrice?: string;
  calculating: boolean;
  priceMoved: boolean;
  expired: boolean;
  countdown: string | null;
  onRefresh: () => void;
}) {
  if (calculating) return null;
  if (priceMoved) {
    return (
      <StatusBanner
        tone="warning"
        title="قیمت طلا تغییر کرده است."
        action="به‌روزرسانی قیمت"
        onAction={onRefresh}
      />
    );
  }
  if (expired) {
    return (
      <StatusBanner
        tone="danger"
        title="قیمت این سفارش منقضی شده است."
        action="دریافت قیمت جدید"
        onAction={onRefresh}
      />
    );
  }
  if (hasQuote && unitPrice) {
    return (
      <section className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#202124] shadow-sm">
        <p>
          قیمت محاسبه شده:{' '}
          <span className="font-bold tabular-nums">{formatMoney(unitPrice)} / گرم</span>
        </p>
        {countdown ? (
          <p className="mt-2 text-[#6B7280]">
            این قیمت تا پایان اعتبار نرخ لحظه‌ای معتبر است.
            <span className="mr-2 font-bold tabular-nums text-[#C8922E]" dir="ltr">
              {countdown}
            </span>
          </p>
        ) : null}
      </section>
    );
  }
  return (
    <p className="rounded-2xl bg-white px-4 py-3 text-sm text-[#6B7280] shadow-sm">
      نمایش قیمت فعلی پس از محاسبه انجام می‌شود.
    </p>
  );
}

function StatusBanner({
  title,
  action,
  onAction,
  tone,
}: {
  title: string;
  action: string;
  onAction: () => void;
  tone: 'warning' | 'danger';
}) {
  const danger = tone === 'danger';
  return (
    <section
      className={cn(
        'rounded-2xl border px-4 py-3',
        danger ? 'border-red-200 bg-red-50 text-[#DC2626]' : 'border-amber-200 bg-amber-50 text-[#92400E]',
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      <button type="button" onClick={onAction} className="mt-2 h-11 text-sm font-bold text-[#C8922E]">
        {action}
      </button>
    </section>
  );
}

function Breakdown({ view, purity }: { view: PricingView; purity: string }) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm md:p-5">
      <h2 className="text-base font-bold text-[#202124]">جزئیات قیمت</h2>
      <dl className="mt-3 divide-y divide-[#E5E7EB] text-sm">
        <Row label="وزن" value={formatWeight(view.weightGrams)} />
        <Row label="عیار" value={purityLabel(purity) || formatPurity(view.purityRatio)} />
        {basePriceDiffers(view) ? <Row label="قیمت پایه" value={formatMoney(view.basePricePerGram)} /> : null}
        <Row label="قیمت هر گرم" value={formatMoney(view.unitPricePerGram)} />
        <Row label="ارزش طلا" value={formatMoney(view.goldValue)} />
        {!isZeroDecimal(view.groupAdjustment) ? (
          <Row label="تعدیل گروهی" value={formatMoney(view.groupAdjustment)} />
        ) : null}
        {view.wageAmount ? <Row label="اجرت" value={formatMoney(view.wageAmount)} /> : null}
        {view.profitAmount ? <Row label="سود" value={formatMoney(view.profitAmount)} /> : null}
        {view.taxAmount ? <Row label="مالیات" value={formatMoney(view.taxAmount)} /> : null}
        {view.discountAmount ? <Row label="تخفیف" value={formatMoney(view.discountAmount)} /> : null}
        {view.roundingAmount ? <Row label="گرد کردن" value={formatMoney(view.roundingAmount)} /> : null}
        <Row label="مبلغ نهایی" value={formatMoney(view.finalPrice)} strong />
      </dl>
    </section>
  );
}

function TotalCard({ amount }: { amount: string }) {
  return (
    <section className="rounded-2xl border border-[#F3E2B8] bg-[#FFF8EB] p-5 shadow-sm">
      <p className="text-sm text-[#6B7280]">مبلغ قابل پرداخت</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-[#202124]">{formatMoney(amount)}</p>
      <p className="mt-2 text-xs text-[#6B7280]">شامل تمام هزینه‌های محاسبه‌شده</p>
    </section>
  );
}

function CreditCard({
  loading,
  error,
  onRetry,
  available,
  orderAmount,
  remaining,
  shortfall,
  insufficient,
}: {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  available?: string;
  orderAmount: string;
  remaining: string | null;
  shortfall: string | null;
  insufficient: boolean;
}) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm md:p-5">
      <h2 className="text-base font-bold text-[#202124]">روش پرداخت</h2>
      <p className="mt-2 text-sm text-[#202124]">اعتبار حساب</p>
      {loading ? <div className="mt-3 h-16 animate-pulse rounded-xl bg-[#F3F4F6]" /> : null}
      {error ? (
        <div className="mt-3">
          <p className="text-sm text-[#DC2626]">موجودی اعتبار دریافت نشد.</p>
          <button type="button" onClick={onRetry} className="mt-2 h-11 text-sm font-medium text-[#C8922E]">
            تلاش مجدد
          </button>
        </div>
      ) : null}
      {!loading && !error && available ? (
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="اعتبار در دسترس" value={formatMoney(available)} />
          <Row label="مبلغ سفارش" value={formatMoney(orderAmount)} />
          {remaining != null ? <Row label="اعتبار باقی‌مانده" value={formatMoney(remaining)} /> : null}
        </dl>
      ) : null}
      {insufficient && shortfall ? (
        <div className="mt-3 rounded-xl bg-red-50 px-3 py-3 text-sm text-[#DC2626]">
          <p className="font-medium">اعتبار کافی نیست</p>
          <p className="mt-1">اعتبار کافی برای ثبت این سفارش ندارید.</p>
          <p className="mt-1">کسری اعتبار: {formatMoney(shortfall)}</p>
          <Link href="/portal/credit" className="mt-2 inline-flex h-11 items-center font-medium text-[#C8922E]">
            مشاهده اعتبار
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function OrderSummary({ view, purity }: { view: PricingView; purity: string }) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm md:p-5">
      <h2 className="text-base font-bold text-[#202124]">خلاصه سفارش</h2>
      <dl className="mt-3 divide-y divide-[#E5E7EB] text-sm">
        <Row label="وزن" value={formatWeight(view.weightGrams)} />
        <Row label="عیار" value={purityLabel(purity)} />
        <Row label="قیمت هر گرم" value={formatMoney(view.unitPricePerGram)} />
        <Row label="مبلغ طلا" value={formatMoney(view.goldValue)} />
        {view.wageAmount ? <Row label="اجرت" value={formatMoney(view.wageAmount)} /> : null}
        {view.taxAmount ? <Row label="مالیات" value={formatMoney(view.taxAmount)} /> : null}
        <Row label="مبلغ نهایی" value={formatMoney(view.finalPrice)} strong />
        <Row label="روش پرداخت" value="اعتبار حساب" />
      </dl>
    </section>
  );
}

function KycBlock() {
  return (
    <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-[#202124]">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#F59E0B]" />
        <div>
          <p className="font-bold">احراز هویت تکمیل نشده است.</p>
          <p className="mt-1 leading-6">برای خرید طلا ابتدا احراز هویت خود را تکمیل کنید.</p>
          <Link
            href="/portal/kyc"
            className="mt-3 inline-flex h-11 items-center justify-center rounded-xl bg-[#F59E0B] px-4 text-sm font-semibold text-white"
          >
            تکمیل احراز هویت
          </Link>
        </div>
      </div>
    </section>
  );
}

function AccountBlock() {
  return (
    <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-[#202124]">
      <p className="font-bold">حساب اعتباری شما برای خرید فعال نیست.</p>
      <Link href="/portal/credit" className="mt-2 inline-flex h-11 items-center font-medium text-[#C8922E]">
        مشاهده اعتبار
      </Link>
    </section>
  );
}

function HowOrderingWorks() {
  const steps = [
    'وزن طلای آبشده و عیار را مشخص می‌کنید.',
    'مبلغ با موتور قیمت سامانه محاسبه می‌شود.',
    'با ثبت سفارش، قیمت همان لحظه را می‌پذیرید و پیش‌فاکتور صادر می‌شود.',
    'فاکتور نهایی پس از تأیید طلافروش صادر می‌شود.',
  ];
  return (
    <section className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm md:p-6">
      <h2 className="text-base font-bold text-[#202124]">نحوه ثبت سفارش</h2>
      <ol className="mt-3 space-y-2 text-sm leading-7 text-[#6B7280]">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-2">
            <span className="font-bold text-[#C8922E]">{toPersianDigits(String(index + 1))}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PurchaseSuccess({
  order,
  onView,
  onDashboard,
}: {
  order: Order;
  onView: () => void;
  onDashboard: () => void;
}) {
  const status = ORDER_STATUS_LABELS[order.status] ?? order.status;
  return (
    <div className="mx-auto w-full max-w-lg">
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 text-center shadow-sm" role="status">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[#16A34A]" />
        <h1 className="mt-3 text-xl font-bold text-[#202124]">سفارش خرید ثبت شد</h1>
        <p className="mt-2 text-sm text-[#6B7280]">سفارش شما با موفقیت ثبت شد.</p>
        <dl className="mt-6 space-y-3 text-right text-sm">
          <Row label="شماره سفارش" value={order.orderNumber} ltr />
          <Row label="مبلغ" value={formatMoney(order.totalAmountRial)} />
          <Row label="وزن" value={formatWeight(order.weightGrams)} />
          <Row label="عیار" value={purityLabel(order.purityRatio) || formatPurity(order.purityRatio)} />
          <Row label="وضعیت" value={status} />
        </dl>
        <p className="mt-5 text-right text-sm leading-7 text-[#202124]">
          پیش‌فاکتور با قیمت پذیرفته‌شده صادر شد. فاکتور نهایی پس از تأیید طلافروش صادر می‌شود.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button type="button" className="h-12 flex-1" onClick={onView}>
            مشاهده سفارش
          </Button>
          <Button type="button" variant="outline" className="h-12 flex-1" onClick={onDashboard}>
            بازگشت به داشبورد
          </Button>
        </div>
      </section>
    </div>
  );
}

function ConfirmPurchase({
  open,
  submitting,
  blocked,
  view,
  purity,
  onClose,
  onConfirm,
}: {
  open: boolean;
  submitting: boolean;
  blocked: boolean;
  view: PricingView | null;
  purity: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, submitting]);

  if (!open || !view) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-purchase-title">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="بستن" onClick={onClose} disabled={submitting} />
      <div className="relative z-10 w-full rounded-t-2xl bg-white p-5 shadow-xl lg:max-w-md lg:rounded-2xl">
        <h2 id="confirm-purchase-title" className="text-lg font-bold text-[#202124]">
          ثبت سفارش خرید
        </h2>
        <p className="mt-3 text-sm font-medium text-[#202124]">
          {formatWeight(view.weightGrams)} طلای آبشده
        </p>
        <dl className="mt-3 text-sm">
          <Row label="عیار" value={purityLabel(purity)} />
          <Row label="قیمت" value={formatMoney(view.unitPricePerGram)} />
          <Row label="مبلغ نهایی" value={formatMoney(view.finalPrice)} strong />
        </dl>
        <p className="mt-4 text-sm leading-7 text-[#6B7280]">با ثبت این سفارش، قیمت فعلی را می‌پذیرید.</p>
        {blocked ? <p className="mt-2 text-sm text-[#DC2626]">قیمت این سفارش منقضی شده است.</p> : null}
        <div className="mt-5 flex gap-3">
          <Button type="button" variant="outline" className="h-12 flex-1" onClick={onClose} disabled={submitting}>
            بازگشت
          </Button>
          <Button type="button" className="h-12 flex-1" onClick={onConfirm} disabled={submitting || blocked}>
            {submitting ? 'ثبت سفارش...' : 'تأیید و ثبت سفارش'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BreakdownSkeleton() {
  return <div className="h-40 animate-pulse rounded-2xl bg-white shadow-sm" aria-hidden />;
}

function Row({
  label,
  value,
  strong,
  ltr,
}: {
  label: string;
  value: string;
  strong?: boolean;
  ltr?: boolean;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-2', strong && 'font-bold')}>
      <dt className={strong ? 'text-[#202124]' : 'text-[#6B7280]'}>{label}</dt>
      <dd className="tabular-nums text-[#202124]" dir={ltr ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  );
}
