'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { CheckCircle2, Coins, RefreshCw, ShieldAlert, Wallet } from 'lucide-react';
import Link from 'next/link';
import { customerApi, ordersApi, pricingApi, type Order } from '@/lib/api';
import {
  compareDecimal,
  floorDivide,
  isZeroDecimal,
  multiplyDecimal,
  subtractDecimal,
} from '@/lib/decimal-string';
import { toPricingView, type PricingView } from '@/lib/pricing-view';
import {
  ORDER_STATUS_LABELS,
  cn,
  formatCountdown,
  formatGroupedPersianInteger,
  formatMoney,
  formatPurity,
  formatRelativeTime,
  formatWeight,
  rialToToman,
  toLatinDigits,
  tomanToRial,
  toPersianDigits,
} from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { OrderRemainingSteps } from '@/components/portal/order-remaining-steps';
import { readAvailableCredit } from '@/lib/credit-view';
import { purchaseErrorMessage } from './purchase-errors';
import {
  DEFAULT_PURITY,
  QUICK_WEIGHTS,
  TRADING_PURITIES,
  purityLabel,
} from './trading-purities';
import { quickTomanStepsFromRial } from './quick-toman-steps';
import {
  canonicalWeight,
  capWeightToAvailable,
  decreaseWeightByMilli,
  isPositiveWeight,
  normalizeWeightInput,
} from './weight-input';

export type TradeSide = 'buy' | 'sell';

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

export function BuyGoldPage({ side = 'buy' }: { side?: TradeSide }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const selling = side === 'sell';
  const [weight, setWeight] = useState('');
  const purity = DEFAULT_PURITY;
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
  const calcSeq = useRef(0);
  const skipAuto = useRef<string | null>(null);
  const [allInWeight, setAllInWeight] = useState<string | null>(null);
  const [pricingAll, setPricingAll] = useState(false);
  const [selectedQuickRial, setSelectedQuickRial] = useState<string | null>(null);
  /** Latin whole-toman digits for the buy amount field. */
  const [tomanDraft, setTomanDraft] = useState('');
  /** When true, the amount field drives weight; otherwise weight/quote fills amount. */
  const amountDrive = useRef(false);

  const price = useSWR('pricing/current-price', () => pricingApi.getCurrentPrice(), {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  });
  const account = useSWR('customer/me/account', () => customerApi.getMyAccount());
  const customer = useSWR('customer/me', () => customerApi.getMe());
  const holding = useSWR('orders/portfolio', () => ordersApi.portfolio());

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

  const available = account.data ? (readAvailableCredit(account.data) ?? undefined) : undefined;
  const availableGold = holding.data?.weightGrams;
  const sellableGrams =
    availableGold && !isZeroDecimal(availableGold)
      ? capWeightToAvailable(availableGold, availableGold)
      : null;
  const sellMaxRial =
    selling && sellableGrams && price.data?.normalizedValue
      ? multiplyDecimal(sellableGrams, price.data.normalizedValue)
      : null;
  const balanceRial = selling ? sellMaxRial : available;
  const availableTomanMax = balanceRial ? Number(wholeTomanDigitsFromRial(balanceRial) || '0') : 0;
  const sliderToman = Math.min(Number(tomanDraft || '0') || 0, availableTomanMax);
  const sliderPercent =
    availableTomanMax > 0 ? Math.min(100, Math.round((sliderToman / availableTomanMax) * 100)) : 0;
  const quickAmounts = quickTomanStepsFromRial(balanceRial);
  const customerTotal = inputsMatch ? quote?.view.customerTotalRial : undefined;
  const creditShort =
    !selling &&
    available != null &&
    customerTotal != null &&
    compareDecimal(available, customerTotal) < 0;
  const shortfall =
    available != null && customerTotal != null && creditShort
      ? subtractDecimal(customerTotal, available)
      : null;
  const goldShort =
    selling &&
    availableGold != null &&
    isPositiveWeight(grams) &&
    compareDecimal(availableGold, grams) < 0;
  const goldShortfall =
    goldShort && availableGold != null ? subtractDecimal(grams, availableGold) : null;

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
    !goldShort &&
    !calculating &&
    !submitting;

  async function runCalculate(nextWeight: string, nextPurity: string) {
    const nextGrams = canonicalWeight(nextWeight);
    if (!isPositiveWeight(nextGrams)) {
      setQuote(null);
      return;
    }
    if (!TRADING_PURITIES.some((item) => item.value === nextPurity)) {
      setError('عیار انتخاب‌شده معتبر نیست.');
      return;
    }
    const seq = ++calcSeq.current;
    setCalculating(true);
    setError(null);
    setAccepted(false);
    setConfirmOpen(false);
    draftRef.current = null;
    try {
      const view = await requestPrice(nextGrams, nextPurity);
      if (seq !== calcSeq.current) return;
      setQuote({
        view,
        expiresAt: quoteExpiry(view.snapshotId),
        weightGrams: nextGrams,
        purityRatio: nextPurity,
      });
    } catch (err) {
      if (seq !== calcSeq.current) return;
      setQuote(null);
      setError(purchaseErrorMessage(err, 'محاسبه قیمت انجام نشد. لطفاً دوباره تلاش کنید.'));
    } finally {
      if (seq === calcSeq.current) setCalculating(false);
    }
  }

  function quoteExpiry(snapshotId: string): string | null {
    return price.data?.snapshotId && price.data.snapshotId === snapshotId
      ? (price.data.expiresAt ?? null)
      : null;
  }

  async function requestPrice(nextGrams: string, nextPurity: string) {
    const result = await pricingApi.calculate({
      weightGrams: nextGrams,
      purityRatio: nextPurity,
      side: selling ? 'SELL' : 'BUY',
      ...(customer.data?.type ? { customerType: customer.data.type } : {}),
      ...(price.data?.snapshotId ? { priceSnapshotId: price.data.snapshotId } : {}),
    });
    return toPricingView(result);
  }

  useEffect(() => {
    if (customer.isLoading) return;
    if (skipAuto.current === grams) {
      skipAuto.current = null;
      return;
    }
    if (!isPositiveWeight(grams)) {
      calcSeq.current += 1;
      setQuote(null);
      setCalculating(false);
      if (!amountDrive.current) setTomanDraft('');
      return;
    }
    const timer = window.setTimeout(() => {
      void runCalculate(grams, purity);
    }, 350);
    return () => window.clearTimeout(timer);
    // Recalculate when the typed weight or the live price snapshot changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grams, purity, liveSnapshot, customer.isLoading, customer.data?.type, selling]);

  useEffect(() => {
    if (amountDrive.current) return;
    if (!quote || !inputsMatch) return;
    const digits = wholeTomanDigitsFromRial(quote.view.customerTotalRial);
    setTomanDraft(digits);
  }, [quote, inputsMatch]);

  useEffect(() => {
    if (!amountDrive.current) return;
    if (selling && !sellableGrams) return;
    const digits = tomanDraft.replace(/\D/g, '');
    if (!digits || digits === '0') {
      calcSeq.current += 1;
      setQuote(null);
      setWeight('');
      setCalculating(false);
      return;
    }
    const rial = tomanToRial(digits);
    if (!rial || isZeroDecimal(rial)) return;
    const timer = window.setTimeout(() => {
      void applyQuickRial(rial, { fromAmountField: true });
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tomanDraft, selling, sellableGrams, liveSnapshot, customer.isLoading, customer.data?.type]);

  /**
   * Resolve the largest 3-decimal weight whose customer total does not exceed `targetRial`.
   * Optionally cap the weight to available gold before the final quote.
   */
  async function weightForTargetRial(
    targetRial: string,
    seq: number,
    options: { capGold?: string | null; emptyMessage: string },
  ): Promise<{ grams: string; view: PricingView } | null> {
    const oneGram = await requestPrice('1', purity);
    if (seq !== calcSeq.current) return null;
    let nextGrams = floorDivide(targetRial, oneGram.customerTotalRial, 3);
    if (!nextGrams) {
      setError(options.emptyMessage);
      setQuote(null);
      return null;
    }
    if (options.capGold) {
      const capped = capWeightToAvailable(nextGrams, options.capGold);
      if (!capped) {
        setError(options.emptyMessage);
        setQuote(null);
        return null;
      }
      nextGrams = capped;
    }
    let view = await requestPrice(nextGrams, purity);
    for (
      let step = 0;
      step < 4 && compareDecimal(view.customerTotalRial, targetRial) > 0;
      step += 1
    ) {
      const lower = decreaseWeightByMilli(nextGrams);
      if (!lower) {
        setError(options.emptyMessage);
        setQuote(null);
        return null;
      }
      nextGrams = lower;
      view = await requestPrice(nextGrams, purity);
    }
    if (seq !== calcSeq.current) return null;
    return { grams: nextGrams, view };
  }

  async function spendAllRial() {
    if (!available || isZeroDecimal(available) || kycBlocked || accountBlocked) return;
    amountDrive.current = false;
    const seq = ++calcSeq.current;
    setPricingAll(true);
    setCalculating(true);
    setError(null);
    setAccepted(false);
    setConfirmOpen(false);
    draftRef.current = null;
    try {
      const priced = await weightForTargetRial(available, seq, {
        emptyMessage: 'دارایی ریالی برای خرید حداقل ۰٫۰۰۱ گرم کافی نیست.',
      });
      if (!priced || seq !== calcSeq.current) return;
      skipAuto.current = priced.grams;
      setAllInWeight(priced.grams);
      setSelectedQuickRial(null);
      setWeight(priced.grams);
      setTomanDraft(wholeTomanDigitsFromRial(priced.view.customerTotalRial));
      setQuote({
        view: priced.view,
        expiresAt: quoteExpiry(priced.view.snapshotId),
        weightGrams: priced.grams,
        purityRatio: purity,
      });
    } catch (err) {
      if (seq !== calcSeq.current) return;
      setQuote(null);
      setError(purchaseErrorMessage(err, 'محاسبه قیمت انجام نشد. لطفاً دوباره تلاش کنید.'));
    } finally {
      if (seq === calcSeq.current) {
        setCalculating(false);
        setPricingAll(false);
      }
    }
  }

  async function applyQuickRial(
    targetRial: string,
    options?: { fromAmountField?: boolean },
  ) {
    if (kycBlocked || accountBlocked) return;
    if (selling && !sellableGrams) return;
    if (!options?.fromAmountField) amountDrive.current = false;
    const seq = ++calcSeq.current;
    setPricingAll(true);
    setCalculating(true);
    setError(null);
    setAccepted(false);
    setConfirmOpen(false);
    draftRef.current = null;
    try {
      const priced = await weightForTargetRial(targetRial, seq, {
        capGold: selling ? sellableGrams : undefined,
        emptyMessage: selling
          ? 'موجودی طلا برای فروش حداقل ۰٫۰۰۱ گرم کافی نیست.'
          : 'این مبلغ برای خرید حداقل ۰٫۰۰۱ گرم کافی نیست.',
      });
      if (!priced || seq !== calcSeq.current) return;
      skipAuto.current = priced.grams;
      setAllInWeight(null);
      setSelectedQuickRial(options?.fromAmountField ? null : targetRial);
      setWeight(priced.grams);
      if (!options?.fromAmountField) {
        setTomanDraft(wholeTomanDigitsFromRial(targetRial));
      }
      setQuote({
        view: priced.view,
        expiresAt: quoteExpiry(priced.view.snapshotId),
        weightGrams: priced.grams,
        purityRatio: purity,
      });
    } catch (err) {
      if (seq !== calcSeq.current) return;
      setQuote(null);
      setError(purchaseErrorMessage(err, 'محاسبه قیمت انجام نشد. لطفاً دوباره تلاش کنید.'));
    } finally {
      if (seq === calcSeq.current) {
        setCalculating(false);
        setPricingAll(false);
      }
    }
  }

  function sellAllGold() {
    if (!availableGold || isZeroDecimal(availableGold) || kycBlocked || accountBlocked) return;
    const nextGrams = capWeightToAvailable(availableGold, availableGold);
    if (!nextGrams) {
      setError('موجودی طلا برای فروش حداقل ۰٫۰۰۱ گرم کافی نیست.');
      return;
    }
    amountDrive.current = false;
    setAllInWeight(nextGrams);
    setSelectedQuickRial(null);
    setWeight(nextGrams);
    setAccepted(false);
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
            side: selling ? 'SELL' : 'BUY',
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
      await Promise.all([
        mutate('customer/me/account'),
        mutate('orders/portfolio'),
        mutate('assets/trades'),
        mutate('orders/recent'),
        mutate('trades/recent'),
      ]);
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
        selling={selling}
        onView={() => router.push(`/portal/orders/${created.id}`)}
        onDashboard={() => router.push('/portal/dashboard')}
      />
    );
  }

  const activeQuote = inputsMatch ? quote : null;
  const pricePending = isPositiveWeight(grams) && !inputsMatch;

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl pb-44 lg:pb-0">
      <TradeSideTabs side={side} />
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
          <h2 className="text-base font-bold text-[#202124]">{selling ? 'مشخصات فروش' : 'مشخصات خرید'}</h2>
          <p className="mt-1 text-xs leading-6 text-[#6B7280]">
            {selling
              ? 'طلای آبشده موجود در دارایی خود را برای فروش انتخاب کنید.'
              : 'طلای آبشده — وزن و عیار را وارد کنید.'}
          </p>

          <div className="mt-5 space-y-5">
            {selling ? (
              <div>
                <p className="text-sm font-medium text-[#202124]">موجودی قابل فروش</p>
                {holding.isLoading && !holding.data ? (
                  <div className="mt-1.5 h-16 animate-pulse rounded-xl bg-[#F3F4F6]" />
                ) : sellableGrams ? (
                  <button
                    type="button"
                    aria-pressed={allInWeight != null && grams === allInWeight}
                    disabled={kycBlocked || accountBlocked}
                    onClick={sellAllGold}
                    className={cn(
                      'mt-1.5 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-right disabled:cursor-not-allowed disabled:opacity-50',
                      allInWeight != null && grams === allInWeight
                        ? 'border-red-600 bg-red-50 text-red-800'
                        : 'border-[#E5E7EB] bg-white text-[#202124]',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Coins className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="text-sm">طلای آبشده</span>
                    </span>
                    <span className="shrink-0 text-base font-bold">{formatWeight(sellableGrams)}</span>
                  </button>
                ) : (
                  <div className="mt-1.5 rounded-xl bg-[#F8F9FA] px-4 py-3 text-sm leading-7 text-[#202124]">
                    <p>طلای آبشده‌ای برای فروش ندارید.</p>
                    <Link
                      href="/portal/orders/new?side=buy"
                      className="mt-2 inline-flex h-11 items-center font-medium text-[#C8922E]"
                    >
                      خرید طلا
                    </Link>
                  </div>
                )}
                {sellableGrams ? (
                  <div className="mt-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label htmlFor="sell-weight" className="text-sm font-medium text-[#202124]">
                          وزن فروش
                        </label>
                        <div className="mt-1.5 flex h-11 w-40 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 focus-within:ring-2 focus-within:ring-[#F59E0B]">
                          <input
                            id="sell-weight"
                            inputMode="decimal"
                            autoComplete="off"
                            enterKeyHint="done"
                            dir="ltr"
                            value={weight ? toPersianDigits(weight) : ''}
                            placeholder="مثال: ۱"
                            onChange={(event) => {
                              const next = normalizeWeightInput(event.target.value);
                              const nextGrams = canonicalWeight(next);
                              amountDrive.current = false;
                              setAllInWeight(null);
                              setSelectedQuickRial(null);
                              if (
                                sellableGrams &&
                                isPositiveWeight(nextGrams) &&
                                compareDecimal(nextGrams, sellableGrams) > 0
                              ) {
                                setWeight(sellableGrams);
                              } else {
                                setWeight(next);
                              }
                              setAccepted(false);
                            }}
                            className="h-full min-w-0 flex-1 bg-transparent text-center text-base text-[#202124] outline-none"
                          />
                          <span className="shrink-0 text-sm text-[#6B7280]">گرم</span>
                        </div>
                      </div>
                      <div>
                        <label htmlFor="sell-amount" className="text-sm font-medium text-[#202124]">
                          مبلغ
                        </label>
                        <div className="mt-1.5 flex h-11 w-52 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 focus-within:ring-2 focus-within:ring-[#F59E0B]">
                          <input
                            id="sell-amount"
                            inputMode="numeric"
                            autoComplete="off"
                            enterKeyHint="done"
                            dir="ltr"
                            value={tomanDraft ? formatGroupedPersianInteger(tomanDraft) : ''}
                            placeholder="مثال: ۲۰,۰۰۰,۰۰۰"
                            onChange={(event) => {
                              amountDrive.current = true;
                              setAllInWeight(null);
                              setSelectedQuickRial(null);
                              setTomanDraft(toLatinDigits(event.target.value).replace(/\D/g, ''));
                              setAccepted(false);
                            }}
                            className="h-full min-w-0 flex-1 bg-transparent text-center text-base text-[#202124] outline-none"
                          />
                          <span className="shrink-0 text-sm text-[#6B7280]">تومان</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="فروش همه طلای موجود"
                        aria-pressed={allInWeight != null && grams === allInWeight}
                        title="فروش همه طلای موجود"
                        disabled={pricingAll || kycBlocked || accountBlocked}
                        onClick={sellAllGold}
                        className={cn(
                          'ms-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border disabled:cursor-not-allowed disabled:opacity-50',
                          allInWeight != null && grams === allInWeight
                            ? 'border-red-600 bg-red-50 text-red-800'
                            : 'border-[#E5E7EB] bg-white text-[#202124]',
                        )}
                      >
                        <Coins className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    <p className="mt-1 w-40 text-xs text-[#6B7280]">حداکثر {formatWeight(sellableGrams)}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label htmlFor="buy-weight" className="text-sm font-medium text-[#202124]">
                      وزن طلا
                    </label>
                    <div className="mt-1.5 flex h-11 w-40 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 focus-within:ring-2 focus-within:ring-[#F59E0B]">
                      <input
                        id="buy-weight"
                        inputMode="decimal"
                        autoComplete="off"
                        enterKeyHint="done"
                        dir="ltr"
                        value={weight ? toPersianDigits(weight) : ''}
                        placeholder="مثال: ۵"
                        onChange={(event) => {
                          amountDrive.current = false;
                          setAllInWeight(null);
                          setSelectedQuickRial(null);
                          setWeight(normalizeWeightInput(event.target.value));
                          setAccepted(false);
                        }}
                        className="h-full min-w-0 flex-1 bg-transparent text-center text-base text-[#202124] outline-none"
                      />
                      <span className="shrink-0 text-sm text-[#6B7280]">گرم</span>
                    </div>
                    {weight && !isPositiveWeight(weight) ? (
                      <p className="mt-1 text-xs text-[#DC2626]">وزن باید عددی بزرگ‌تر از صفر باشد.</p>
                    ) : null}
                  </div>
                  <div>
                    <label htmlFor="buy-amount" className="text-sm font-medium text-[#202124]">
                      مبلغ
                    </label>
                    <div className="mt-1.5 flex h-11 w-52 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 focus-within:ring-2 focus-within:ring-[#F59E0B]">
                      <input
                        id="buy-amount"
                        inputMode="numeric"
                        autoComplete="off"
                        enterKeyHint="done"
                        dir="ltr"
                        value={tomanDraft ? formatGroupedPersianInteger(tomanDraft) : ''}
                        placeholder="مثال: ۲۰,۰۰۰,۰۰۰"
                        onChange={(event) => {
                          amountDrive.current = true;
                          setAllInWeight(null);
                          setSelectedQuickRial(null);
                          setTomanDraft(toLatinDigits(event.target.value).replace(/\D/g, ''));
                          setAccepted(false);
                        }}
                        className="h-full min-w-0 flex-1 bg-transparent text-center text-base text-[#202124] outline-none"
                      />
                      <span className="shrink-0 text-sm text-[#6B7280]">تومان</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="خرید با همه دارایی ریالی"
                    aria-pressed={allInWeight != null && grams === allInWeight}
                    title="خرید با همه دارایی ریالی"
                    disabled={
                      pricingAll ||
                      !available ||
                      isZeroDecimal(available) ||
                      kycBlocked ||
                      accountBlocked
                    }
                    onClick={() => void spendAllRial()}
                    className={cn(
                      'ms-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border disabled:cursor-not-allowed disabled:opacity-50',
                      allInWeight != null && grams === allInWeight
                        ? 'border-[#C8922E] bg-[#FFF8EB] text-[#92400E]'
                        : 'border-[#E5E7EB] bg-white text-[#202124]',
                    )}
                  >
                    <Wallet className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            )}

            {selling && !sellableGrams ? null : (
              <div className="min-w-0 space-y-4">
                {availableTomanMax > 0 ? (
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor="balance-slider" className="text-sm font-medium text-[#202124]">
                        {selling ? 'میزان فروش از دارایی' : 'میزان خرید از مانده'}
                      </label>
                      <p className="flex items-center gap-2 text-sm font-medium text-[#202124]">
                        <span dir="ltr">
                          {formatGroupedPersianInteger(String(sliderToman))}
                          <span className="mr-1 text-xs font-normal text-[#6B7280]">تومان</span>
                        </span>
                        <span className="rounded-lg bg-[#F3F4F6] px-2 py-0.5 text-xs font-semibold text-[#202124]" dir="ltr">
                          {toPersianDigits(String(sliderPercent))}٪
                        </span>
                      </p>
                    </div>
                    <input
                      id="balance-slider"
                      type="range"
                      min={0}
                      max={availableTomanMax}
                      step={sliderStep(availableTomanMax)}
                      value={sliderToman}
                      disabled={pricingAll || kycBlocked || accountBlocked}
                      dir="ltr"
                      aria-valuetext={`${sliderPercent} درصد`}
                      onChange={(event) => {
                        const next = Number(event.target.value) || 0;
                        amountDrive.current = true;
                        setAllInWeight(null);
                        setSelectedQuickRial(null);
                        setTomanDraft(next <= 0 ? '' : String(next));
                        setAccepted(false);
                      }}
                      className={cn(
                        'mt-3 h-2 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
                        selling ? 'accent-red-600' : 'accent-[#C8922E]',
                      )}
                    />
                    <div className="mt-1.5 flex justify-between text-xs text-[#6B7280]" dir="ltr">
                      <span>{toPersianDigits('0')}٪</span>
                      <span>
                        {formatGroupedPersianInteger(String(availableTomanMax))} تومان · {toPersianDigits('100')}٪
                      </span>
                    </div>
                  </div>
                ) : null}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#202124]">مقدار سریع</p>
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {QUICK_WEIGHTS.map((value) => {
                      const selected = grams === value;
                      const overHolding =
                        selling &&
                        sellableGrams != null &&
                        compareDecimal(value, sellableGrams) > 0;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={selected}
                          disabled={overHolding || kycBlocked || accountBlocked}
                          onClick={() => {
                            amountDrive.current = false;
                            setAllInWeight(null);
                            setSelectedQuickRial(null);
                            setWeight(value);
                            setAccepted(false);
                          }}
                          className={cn(
                            'h-11 shrink-0 rounded-xl border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50',
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

                {quickAmounts.length > 0 ? (
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#202124]">مبلغ سریع (تومان)</p>
                    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                      {quickAmounts.map((item) => {
                        const unitPrice = price.data?.normalizedValue;
                        const estimable =
                          unitPrice != null && floorDivide(item.rial, unitPrice, 3) != null;
                        const selected = selectedQuickRial === item.rial;
                        return (
                          <button
                            key={item.rial}
                            type="button"
                            aria-pressed={selected}
                            disabled={
                              pricingAll ||
                              (selling && !sellableGrams) ||
                              !estimable ||
                              kycBlocked ||
                              accountBlocked
                            }
                            onClick={() => void applyQuickRial(item.rial)}
                            className={cn(
                              'h-11 shrink-0 rounded-xl border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50',
                              selected
                                ? selling
                                  ? 'border-red-600 bg-red-50 text-red-800'
                                  : 'border-[#C8922E] bg-[#FFF8EB] text-[#92400E]'
                                : 'border-[#E5E7EB] bg-white text-[#202124]',
                            )}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-[#202124]">عیار</p>
              <p className="mt-2 flex h-12 min-h-11 items-center rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm text-[#202124]">
                {purityLabel(DEFAULT_PURITY)}
              </p>
            </div>
          </div>
        </section>

        <aside className="min-w-0 space-y-4">
          <PriceStatus
            calculating={calculating}
            priceMoved={priceMoved}
            expired={expired}
            onRefresh={() => void runCalculate(weight, purity)}
          />

          {calculating || pricePending ? <BreakdownSkeleton /> : null}

          {activeQuote && !calculating ? (
            <>
              <OrderSummary view={activeQuote.view} purity={purity} selling={selling} />
              <TotalCard amount={activeQuote.view.customerTotalRial} selling={selling} />
              {creditShort && shortfall ? (
                <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-[#DC2626] shadow-sm">
                  <p className="font-medium">ارزش این وزن از دارایی ریالی شما بیشتر است.</p>
                  <p className="mt-1">کمبود: {formatMoney(shortfall)}</p>
                  <Link href="/portal/credit" className="mt-2 inline-flex h-11 items-center font-medium text-[#C8922E]">
                    مشاهده دارایی ریالی
                  </Link>
                </div>
              ) : null}
              {goldShort && goldShortfall ? (
                <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-[#DC2626] shadow-sm">
                  <p className="font-medium">وزن انتخاب‌شده از موجودی طلای شما بیشتر است.</p>
                  <p className="mt-1">کمبود: {formatWeight(goldShortfall)}</p>
                  <Link href="/portal/assets" className="mt-2 inline-flex h-11 items-center font-medium text-[#C8922E]">
                    مشاهده دارایی طلا
                  </Link>
                </div>
              ) : null}
            </>
          ) : !calculating && !pricePending ? (
            <section className="rounded-2xl border border-dashed border-[#E5E7EB] bg-white px-4 py-8 text-center text-sm text-[#6B7280]">
              وزن را وارد کنید تا مبلغ همین‌جا محاسبه شود.
            </section>
          ) : null}

          <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 border-t border-[#E5E7EB] bg-white p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] lg:static lg:inset-auto lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            {activeQuote ? (
              <p className="mb-2 flex items-baseline justify-between gap-3 lg:hidden">
                <span className="text-xs text-[#6B7280]">
                  {selling ? 'مبلغ قابل دریافت' : 'مبلغ قابل پرداخت'}
                </span>
                <span className="text-base font-bold text-[#202124]">
                  {formatMoney(activeQuote.view.customerTotalRial)}
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

      <ConfirmPurchase
        open={confirmOpen}
        submitting={submitting}
        blocked={quoteBlocked}
        selling={selling}
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

/** Whole toman digits (Latin) from a rial amount for the buy amount field. */
function wholeTomanDigitsFromRial(rial: string): string {
  const toman = rialToToman(rial);
  if (toman == null || isZeroDecimal(toman)) return '';
  const [whole = '0'] = toman.split('.');
  return whole.replace(/^0+(?=\d)/, '') || '0';
}

/** Coarser steps on large balances so the range input stays usable. */
function sliderStep(maxToman: number): number {
  if (maxToman >= 100_000_000) return 100_000;
  if (maxToman >= 10_000_000) return 10_000;
  if (maxToman >= 1_000_000) return 1_000;
  return 1;
}

function TradeSideTabs({ side }: { side: TradeSide }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2" role="tablist" aria-label="نوع معامله">
      <Link
        href="/portal/orders/new?side=buy"
        role="tab"
        aria-selected={side === 'buy'}
        className={cn(
          'inline-flex h-12 items-center justify-center rounded-xl border text-sm font-semibold',
          side === 'buy'
            ? 'border-emerald-600 bg-emerald-600 text-white'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800',
        )}
      >
        خرید طلا
      </Link>
      <Link
        href="/portal/orders/new?side=sell"
        role="tab"
        aria-selected={side === 'sell'}
        className={cn(
          'inline-flex h-12 items-center justify-center rounded-xl border text-sm font-semibold',
          side === 'sell'
            ? 'border-red-600 bg-red-600 text-white'
            : 'border-red-200 bg-red-50 text-red-800',
        )}
      >
        فروش طلا
      </Link>
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
            <p className="mt-2 text-2xl font-bold text-[#202124] md:text-3xl">
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
  calculating,
  priceMoved,
  expired,
  onRefresh,
}: {
  calculating: boolean;
  priceMoved: boolean;
  expired: boolean;
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
  return null;
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

function TotalCard({ amount, selling }: { amount: string; selling?: boolean }) {
  return (
    <section className="rounded-2xl border border-[#F3E2B8] bg-[#FFF8EB] p-5 shadow-sm">
      <p className="text-sm text-[#6B7280]">{selling ? 'مبلغ قابل دریافت' : 'مبلغ قابل پرداخت'}</p>
      <p className="mt-1 text-left text-3xl font-bold text-[#202124]" dir="ltr">
        {formatMoney(amount)}
      </p>
      <p className="mt-2 text-xs text-[#6B7280]">شامل تمام هزینه‌های محاسبه‌شده</p>
    </section>
  );
}

function OrderSummary({
  view,
  purity,
  selling,
}: {
  view: PricingView;
  purity: string;
  selling?: boolean;
}) {
  const groupAdj =
    view.groupAdjustment && !isZeroDecimal(view.groupAdjustment) ? view.groupAdjustment : null;
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm md:p-5">
      <h2 className="text-base font-bold text-[#202124]">خلاصه سفارش</h2>
      <dl className="mt-3 divide-y divide-[#E5E7EB] text-sm">
        <Row label="وزن" value={formatWeight(view.weightGrams)} />
        <Row label="عیار" value={purityLabel(purity)} />
        <Row label="قیمت هر گرم" value={formatMoney(view.unitPricePerGram)} />
        <Row
          label={selling ? 'ارزش ناخالص فروش' : 'مبلغ طلا'}
          value={formatMoney(view.goldValue)}
        />
        {groupAdj ? <Row label="تعدیل گروهی" value={formatMoney(groupAdj)} /> : null}
        {view.wageAmount ? <Row label="اجرت" value={formatMoney(view.wageAmount)} /> : null}
        {view.discountAmount ? (
          <Row label="تخفیف" value={formatMoney(view.discountAmount)} />
        ) : null}
        {view.roundingAmount ? (
          <Row label="گرد کردن" value={formatMoney(view.roundingAmount)} />
        ) : null}
        {view.taxAmount ? <Row label="مالیات" value={formatMoney(view.taxAmount)} /> : null}
        {view.charges.map((c) => (
          <Row
            key={`${c.code}-${c.side}`}
            label={c.labelFa || (selling ? 'کارمزد فروش' : 'کارمزد خرید')}
            value={formatMoney(c.amount)}
          />
        ))}
        <Row
          label={selling ? 'مبلغ قابل دریافت' : 'مبلغ قابل پرداخت'}
          value={formatMoney(view.customerTotalRial)}
          strong
        />
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
          <p className="mt-1 leading-6">برای معامله طلا ابتدا احراز هویت خود را تکمیل کنید.</p>
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
      <p className="font-bold">حساب اعتباری شما برای معامله فعال نیست.</p>
      <Link href="/portal/credit" className="mt-2 inline-flex h-11 items-center font-medium text-[#C8922E]">
        مشاهده اعتبار
      </Link>
    </section>
  );
}

function PurchaseSuccess({
  order,
  selling,
  onView,
  onDashboard,
}: {
  order: Order;
  selling?: boolean;
  onView: () => void;
  onDashboard: () => void;
}) {
  const status = ORDER_STATUS_LABELS[order.status] ?? order.status;
  return (
    <div className="mx-auto w-full max-w-lg">
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 text-center shadow-sm" role="status">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[#16A34A]" />
        <h1 className="mt-3 text-xl font-bold text-[#202124]">
          {selling ? 'سفارش فروش ثبت شد' : 'سفارش خرید ثبت شد'}
        </h1>
        <p className="mt-2 text-sm text-[#6B7280]">سفارش شما با موفقیت ثبت شد.</p>
        <dl className="mt-6 space-y-3 text-right text-sm">
          <Row label="شماره سفارش" value={toPersianDigits(order.orderNumber)} ltr />
          <Row label="مبلغ" value={formatMoney(order.totalAmountRial)} />
          <Row label="وزن" value={formatWeight(order.weightGrams)} />
          <Row label="عیار" value={purityLabel(order.purityRatio) || formatPurity(order.purityRatio)} />
          <Row label="وضعیت" value={status} />
        </dl>
        <p className="mt-5 text-right text-sm leading-7 text-[#202124]">
          پیش‌فاکتور با قیمت پذیرفته‌شده صادر شد. فاکتور نهایی پس از تأیید طلافروش صادر می‌شود.
        </p>
        <div className="mt-4 text-right">
          <OrderRemainingSteps status={order.status} />
        </div>
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
  selling,
  view,
  purity,
  onClose,
  onConfirm,
}: {
  open: boolean;
  submitting: boolean;
  blocked: boolean;
  selling?: boolean;
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
          {selling ? 'ثبت سفارش فروش' : 'ثبت سفارش خرید'}
        </h2>
        <p className="mt-3 text-sm font-medium text-[#202124]">
          {formatWeight(view.weightGrams)} طلای آبشده
        </p>
        <dl className="mt-3 text-sm">
          <Row label="عیار" value={purityLabel(purity)} />
          <Row label="قیمت" value={formatMoney(view.unitPricePerGram)} />
          {view.charges.map((c) => (
            <Row
              key={`${c.code}-${c.side}`}
              label={c.labelFa || (selling ? 'کارمزد فروش' : 'کارمزد خرید')}
              value={formatMoney(c.amount)}
            />
          ))}
          <Row
            label={selling ? 'مبلغ قابل دریافت' : 'مبلغ قابل پرداخت'}
            value={formatMoney(view.customerTotalRial)}
            strong
          />
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
      <dd className="text-[#202124]" dir={ltr ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  );
}
