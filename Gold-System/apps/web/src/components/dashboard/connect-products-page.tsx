'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { ApiClientError, connectProductsApi, type ConnectProduct, type ConnectProductMapping } from '@/lib/api';
import { formatFaNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/dashboard/page-header';

const EMPTY: ConnectProductMapping = { internalAssetType: null, internalGoldPurity: null, externalQuantityUnit: null, externalPriceCurrency: null, priceUnitBasis: null, cashPriceCategory: null, conversionFactor: null, connectBuySide: null, connectSellSide: null, isEnabled: false, isVerified: false };
const CONNECT_READ_SWR_OPTIONS = { dedupingInterval: 10_000, revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false, keepPreviousData: true } as const;
const labels: Record<string, string> = { VALID: 'معتبر', PARTIAL: 'ناقص', INVALID: 'ناسازگار', INVALID_PRODUCT_ID: 'شناسه نامعتبر', INVALID_PRODUCT_TITLE: 'عنوان نامعتبر', INVALID_BUY_PRICE: 'قیمت خرید نامعتبر', INVALID_SELL_PRICE: 'قیمت فروش نامعتبر', INVALID_PRODUCT_STATUS: 'وضعیت محصول نامعتبر', INVALID_PRODUCTS_RESPONSE: 'ساختار پاسخ نامعتبر', NEGATIVE_PRICE: 'قیمت منفی است', NON_FINITE_PRICE: 'قیمت عدد متناهی نیست', NULL_PRICE: 'قیمت خالی است', STRING_PRICE: 'قیمت به‌صورت رشته دریافت شده است', MISSING_PRICE: 'فیلد قیمت وجود ندارد', INVALID_PRICE_TYPE: 'نوع فیلد قیمت معتبر نیست' };
const price = (value: string | null) => value == null ? '—' : formatFaNumber(Number(value));
function errorMessageFa(error: unknown, fallback: string, rateLimitMessage = 'به‌دلیل محدودیت درخواست، کمی صبر کنید و دوباره اقدام کنید.') {
  if (!(error instanceof ApiClientError)) return fallback;
  if (error.status === 429) return rateLimitMessage;
  if (error.status === 403) return 'مجوز انجام این عملیات را ندارید.';
  return /[\u0600-\u06FF]/.test(error.message) ? error.message : fallback;
}

function shadowReasonFa(reason: string) { const labels: Record<string,string> = { NO_CANDIDATE_SELECTED: 'گزینهٔ آزمایشی انتخاب نشده است.', CANDIDATE_NOT_FOUND: 'محصول انتخاب‌شده در کاتالوگ نیست.', PRODUCT_NOT_VALID: 'اطلاعات محصول معتبر نیست.', PRODUCT_NOT_SEEN: 'محصول در همگام‌سازی اخیر دیده نشده است.', PRODUCT_INACTIVE: 'محصول غیرفعال است.', CONNECT_PRICE_STALE: 'قیمت Connect قدیمی است.', MAPPING_NOT_VERIFIED: 'نگاشت تأیید نشده است.', NOT_VERIFIED_18K_MAPPING: 'نگاشت طلای وزنی با عیار ۱۸ تأیید نشده است.', MAPPING_UNIT_CURRENCY_OR_BASIS_MISSING: 'واحد، ارز یا مبنای قیمت کامل نیست.', CONVERSION_FACTOR_INVALID: 'ضریب تبدیل معتبر نیست.', MAPPING_VERSION_CHANGED: 'نگاشت پس از انتخاب مرجع تغییر کرده است؛ انتخاب مدیر باید دوباره انجام شود.', PRICE_DIRECTION_UNCONFIRMED: 'جهت قیمت تأیید نشده است.', CURRENT_REFERENCE_UNAVAILABLE: 'قیمت مرجع موجود نیست.', CURRENT_REFERENCE_STALE: 'قیمت مرجع قدیمی است.', PRICE_CONTRACT_UNRESOLVED: 'قرارداد قیمت در تصمیم تجاری باز است.', NO_REFERENCE_SELECTED: 'برای این دسته مرجعی انتخاب نشده است.', PRODUCT_NOT_FOUND: 'محصول مرجع در کاتالوگ موجود نیست.', PRODUCT_INVALID: 'اطلاعات ضروری محصول معتبر نیست.', PRODUCT_DISABLED: 'تأمین‌کننده محصول را غیرفعال کرده است.', PRICE_CONTRACT_UNCONFIRMED: 'واحد، ارز یا مبنای مظنه تأیید نشده است.', INTERNAL_PRICE_CONTRACT_UNCONFIRMED: 'عیار مرجع قیمت داخلی تأیید نشده؛ مقایسه متوقف است.', BUY_DISABLED_BY_PROVIDER: 'خرید این محصول توسط تأمین‌کننده غیرفعال است.', SELL_DISABLED_BY_PROVIDER: 'فروش این محصول توسط تأمین‌کننده غیرفعال است.', INVALID_PRICE: 'قیمت معتبر برای این جهت در دسترس نیست.' }; return labels[reason] ?? 'وضعیت نیازمند بررسی مدیر است.'; }


export function ConnectProductsPage() {
  const { user } = useAuth();
  const canRead = hasPermission(user?.permissions, 'connect.products.read');
  const canSync = hasPermission(user?.permissions, 'connect.products.sync');
  const canManage = hasPermission(user?.permissions, 'connect.products.mapping.manage');
  const canVerify = hasPermission(user?.permissions, 'connect.products.mapping.verify');
  const [page, setPage] = useState(1), [search, setSearch] = useState(''), [validationStatus, setValidation] = useState(''), [mappingStatus, setMappingStatus] = useState(''), [active, setActive] = useState('');
  const [selected, setSelected] = useState<ConnectProduct | null>(null), [mapping, setMapping] = useState(EMPTY), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
  const verifyInFlight = useRef(false);
  const [syncIssues, setSyncIssues] = useState<ConnectProduct['lastValidationErrors']>([]);
  const [syncCooldownUntil, setSyncCooldownUntil] = useState<number | null>(null), [syncCooldownSeconds, setSyncCooldownSeconds] = useState(0);
  const [shadowMaxAge, setShadowMaxAge] = useState(300);
  const [displayMode, setDisplayMode] = useState<'MESGHAL' | 'GRAM' | 'BOTH'>('BOTH');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const query = useMemo(() => ({ page, pageSize: 100, search: search || undefined, validationStatus: validationStatus || undefined, mappingStatus: mappingStatus || undefined, isActive: active ? active === 'ACTIVE' : undefined }), [page, search, validationStatus, mappingStatus, active]);
  const { data, error, isLoading, mutate } = useSWR(canRead ? ['connect-products', query] : null, () => connectProductsApi.list(query), CONNECT_READ_SWR_OPTIONS);
  const { data: syncInfo, error: syncInfoError, mutate: refreshSync } = useSWR(canRead ? 'connect-products-sync-status' : null, () => connectProductsApi.syncStatus(), CONNECT_READ_SWR_OPTIONS);
  const { data: cashShadow, error: cashShadowError, mutate: refreshCashShadow } = useSWR(canRead ? 'connect-cash-shadow' : null, () => connectProductsApi.cashShadow(), CONNECT_READ_SWR_OPTIONS);
  useEffect(() => {
    if (!syncCooldownUntil) { setSyncCooldownSeconds(0); return; }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((syncCooldownUntil - Date.now()) / 1000));
      setSyncCooldownSeconds(remaining);
      if (remaining === 0) setSyncCooldownUntil(null);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [syncCooldownUntil]);
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { if (cashShadow?.maxPriceAgeSeconds) setShadowMaxAge(cashShadow.maxPriceAgeSeconds); }, [cashShadow?.maxPriceAgeSeconds]);
  useEffect(() => { if (cashShadow?.displayMode) setDisplayMode(cashShadow.displayMode); }, [cashShadow?.displayMode]);
  if (!canRead) return <main dir="rtl" className="p-6"><p role="alert">مجوز مشاهده محصولات Connect را ندارید.</p></main>;
  const choose = (p: ConnectProduct) => { setSelected(p); setMapping({ ...EMPTY, ...(p.mapping ?? {}) }); setFeedback(''); };
  const sync = async () => { if (syncCooldownSeconds > 0 || busy) return; setBusy(true); setFeedback(''); setSyncCooldownUntil(Date.now() + 30_000); setSyncCooldownSeconds(30); try { const r = await connectProductsApi.sync(); setSyncIssues(r.issues ?? []); setFeedback(`دریافت انجام شد: ${formatFaNumber(r.totalCount)} محصول، ${formatFaNumber(r.newCount)} جدید، ${formatFaNumber(r.updatedCount)} به‌روزشده، ${formatFaNumber(r.invalidCount)} ناسازگار.`); await Promise.all([mutate(), refreshSync(), refreshCashShadow()]); } catch (e) { setFeedback(errorMessageFa(e, 'همگام‌سازی انجام نشد؛ داده‌های قبلی حفظ شده‌اند.', 'درخواست همگام‌سازی اخیراً انجام شده است؛ برای رعایت محدودیت امنیتی، ۳۰ ثانیه صبر کنید.')); } finally { setBusy(false); } };
  const update = (key: keyof ConnectProductMapping, value: string) => setMapping(v => ({ ...v, [key]: value || null, isVerified: false, isEnabled: false }));
  const save = async (verify = false) => {
    if (!selected || (verify && verifyInFlight.current)) return;
    if (verify) verifyInFlight.current = true;
    setBusy(true);
    try {
      const result = verify ? await connectProductsApi.verifyMapping(selected.id) : await connectProductsApi.saveMapping(selected.id, mapping);
      const saved = { ...EMPTY, ...result };
      setMapping(saved);
      setSelected((current) => current?.id === selected.id ? { ...current, mapping: saved } : current);
      setFeedback(verify ? 'نگاشت تأیید شد؛ وضعیت فعال‌سازی همچنان مستقل و خاموش است.' : 'پیش‌نویس نگاشت ذخیره شد.');
      await mutate();
    } catch (e) {
      setFeedback(errorMessageFa(e, 'ذخیره یا تأیید نگاشت انجام نشد؛ داده‌های قبلی حفظ شده‌اند.'));
    } finally {
      if (verify) verifyInFlight.current = false;
      setBusy(false);
    }
  };
  const saveShadowMaxAge = async () => { setBusy(true); try { await connectProductsApi.setShadowMaxAge(shadowMaxAge); await refreshCashShadow(); } catch (e) { setFeedback(errorMessageFa(e, 'ذخیرهٔ تنظیم بازهٔ تازگی انجام نشد.')); } finally { setBusy(false); } };
  const saveCashReference = async (category: string) => { if (!selected) return; setBusy(true); try { await connectProductsApi.selectCashReference(category, selected.id); await refreshCashShadow(); setFeedback('مرجع آزمایشی ذخیره شد؛ تا تأیید قرارداد قیمت، فقط در حالت آزمایشی می‌ماند.'); } catch (e) { setFeedback(errorMessageFa(e, 'انتخاب مرجع انجام نشد؛ منبع قبلی حفظ شده است.')); } finally { setBusy(false); } };
  const saveDisplayMode = async (mode: 'MESGHAL' | 'GRAM' | 'BOTH') => { setDisplayMode(mode); try { await connectProductsApi.setShadowDisplayMode(mode); await refreshCashShadow(); } catch (e) { setFeedback(errorMessageFa(e, 'ذخیرهٔ حالت نمایش انجام نشد.')); } };
  const counts = syncInfo?.counts ?? [];
  const count = (status?: string) => counts.filter((c: any) => !status || c.validationStatus === status).reduce((sum: number, c: any) => sum + c.count, 0);
  const priceIsHistorical = (item: any) => Boolean(item.historicalOnly || !item.product?.lastValidAt || clockNow - new Date(item.product.lastValidAt).getTime() > (cashShadow?.maxAgeSeconds ?? 300) * 1000);
  const cashPanel = <Card><CardHeader><CardTitle>قیمت‌های نقد و تبدیل مثقال به گرم</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">قیمت‌های این بخش آزمایشی هستند و در معاملات مشتری اعمال نمی‌شوند.</p>
    <div className="flex flex-wrap items-center gap-2"><label>حالت نمایش<select className="mr-2 h-10 rounded border px-2" value={displayMode} disabled={!canManage} onChange={e=>saveDisplayMode(e.target.value as 'MESGHAL'|'GRAM'|'BOTH')}><option value="MESGHAL">مثقال</option><option value="GRAM">گرم</option><option value="BOTH">ترکیبی</option></select></label><span className="text-sm">قیمت Connect به تومان/مثقال است. تومان/گرم = تومان/مثقال ÷ ۴٫۳۳۱۸؛ معادل ریالی = تومان × ۱۰.</span></div>
    {canManage && <div className="flex items-end gap-2"><label>حداکثر عمر قیمت (ثانیه)<Input type="number" min={30} max={3600} value={shadowMaxAge} onChange={e=>setShadowMaxAge(Number(e.target.value))}/></label><Button variant="outline" disabled={busy} onClick={saveShadowMaxAge}>ذخیره تازگی</Button></div>}
    {cashShadowError && !cashShadow && <p role="status" className="text-sm text-amber-800">{errorMessageFa(cashShadowError, 'پیش‌نمایش قیمت فعلاً در دسترس نیست.')}</p>}
    <div className="grid gap-3 lg:grid-cols-3">{(cashShadow?.categories ?? []).map((item: any) => <Card key={item.category}><CardHeader><CardTitle>{item.label}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
      <p>وضعیت منبع: {item.product?.availability === 'AVAILABLE' ? 'فعال' : item.product?.availability === 'DISABLED_BY_PROVIDER' ? 'این محصول توسط تأمین‌کننده غیرفعال شده است.' : item.product?.availability === 'NOT_SEEN' ? 'این محصول در آخرین فهرست تأمین‌کننده موجود نیست.' : item.product?.availability === 'INVALID' ? 'نامعتبر' : 'انتخاب نشده'}</p>
      <p>منبع انتخاب‌شده: {item.product?.title ?? 'انتخاب نشده'} {item.product?.externalProductId ? `(${item.product.externalProductId})` : ''}</p>
      {(item.displayMode === 'MESGHAL' || item.displayMode === 'BOTH') && <><p>خرید از بالادستی، مثقال: {item.sides?.buy?.rawMesghalPriceToman ? price(item.sides.buy.rawMesghalPriceToman) : 'آماده نیست'} تومان{priceIsHistorical(item) && item.sides?.buy?.rawMesghalPriceToman ? ' — تاریخی، نه زنده' : ''}</p><p>فروش به بالادستی، مثقال: {item.sides?.sell?.rawMesghalPriceToman ? price(item.sides.sell.rawMesghalPriceToman) : 'آماده نیست'} تومان{priceIsHistorical(item) && item.sides?.sell?.rawMesghalPriceToman ? ' — تاریخی، نه زنده' : ''}</p></>}
      {(item.displayMode === 'GRAM' || item.displayMode === 'BOTH') && <><p>خرید از بالادستی، گرم: {item.sides?.buy?.gram18PriceToman ? price(item.sides.buy.gram18PriceToman) : 'آماده نیست'} تومان/گرم ۱۸ عیار{priceIsHistorical(item) && item.sides?.buy?.gram18PriceToman ? ' — تاریخی، نه زنده' : ''}</p><p>فروش به بالادستی، گرم: {item.sides?.sell?.gram18PriceToman ? price(item.sides.sell.gram18PriceToman) : 'آماده نیست'} تومان/گرم ۱۸ عیار{priceIsHistorical(item) && item.sides?.sell?.gram18PriceToman ? ' — تاریخی، نه زنده' : ''}</p></>}
      <p>آخرین دریافت: {item.product?.lastFetchedAt ? new Date(item.product.lastFetchedAt).toLocaleString('fa-IR') : '—'}{priceIsHistorical(item) ? ' — قیمت زنده نیست' : ''}</p>
      <details><summary className="cursor-pointer">جزئیات فنی</summary><div className="mt-2 space-y-2">
      <p>قیمت مرجع فعلی سامانه: {item.internalReference?.value ? price(item.internalReference.value) : 'موجود نیست'} {item.internalReference?.unit ?? ''} {item.internalReference?.currency ?? ''} — عیار مرجع: {item.internalReference?.purityReference ?? 'نامشخص'}{item.internalReference?.fresh === false ? ' — قدیمی' : ''}</p>
      <p>پرچم‌های is_buy_active / is_sell_active: {String(item.sides?.buy?.providerActive ?? 'نامشخص')} / {String(item.sides?.sell?.providerActive ?? 'نامشخص')} — معنای عملیاتی این پرچم‌ها هنوز تأیید نشده است.</p>
      <p>معادل داخلی برای موتور: خرید {item.sides?.buy?.gram18PriceRial ? price(item.sides.buy.gram18PriceRial) : 'آماده نیست'} ریال/گرم؛ فروش {item.sides?.sell?.gram18PriceRial ? price(item.sides.sell.gram18PriceRial) : 'آماده نیست'} ریال/گرم</p>
      <p>اختلاف خرید با مرجع داخلی: {item.sides?.buy?.comparison ? `${price(item.sides.buy.comparison.difference)} ریال/گرم (${price(item.sides.buy.comparison.differencePercent)}٪)` : 'محاسبه نمی‌شود؛ واحد یا عیار مرجع داخلی تأیید نشده است.'}</p>
      <p>اختلاف فروش با مرجع داخلی: {item.sides?.sell?.comparison ? `${price(item.sides.sell.comparison.difference)} ریال/گرم (${price(item.sides.sell.comparison.differencePercent)}٪)` : 'محاسبه نمی‌شود؛ واحد یا عیار مرجع داخلی تأیید نشده است.'}</p>
      <p>آخرین قیمت معتبر: {item.product?.lastValidAt ? new Date(item.product.lastValidAt).toLocaleString('fa-IR') : '—'}{item.historicalOnly ? ' — تاریخی، نه زنده' : ''}</p><p>وضعیت پیش‌نمایش: {item.status === 'READY' ? 'آماده' : item.status === 'STALE' ? 'قدیمی' : item.status === 'UNAVAILABLE' ? 'در دسترس نیست' : item.status === 'INVALID_MAPPING' ? 'نگاشت نامعتبر' : item.status === 'INVALID_PRICE' ? 'قیمت نامعتبر' : 'آماده نیست'}</p>
      <p>آمادگی تبدیل: {item.conversionReady ? 'آماده' : 'متوقف'} — مقایسه با مرجع داخلی: {item.comparisonReady ? 'آماده' : 'متوقف'} — قیمت عملیاتی: غیرفعال</p>
      {(item.reasons ?? []).map((r: string) => <p key={r} className="text-amber-800">{shadowReasonFa(r)}</p>)}
      {cashShadowError && <p className="text-amber-800">{errorMessageFa(cashShadowError, 'بازیابی پیش‌نمایش با خطا روبه‌رو شد؛ دادهٔ قبلی نمایش داده می‌شود.')}</p>}
      {syncInfoError && <p className="text-amber-800">{errorMessageFa(syncInfoError, 'بازیابی وضعیت همگام‌سازی ممکن نشد.')}</p>}
      </div></details>
      {canManage && <Button variant="outline" disabled={!selected || busy || selected.mapping?.cashPriceCategory !== item.category} onClick={()=>saveCashReference(item.category)}>انتخاب یا تغییر منبع</Button>}
    </CardContent></Card>)}</div>
  </CardContent></Card>;
  return <main dir="rtl" className="space-y-5 p-4 md:p-6">
    <PageHeader title="محصولات تأمین‌کننده Connect" description="مشاهده، اعتبارسنجی و تطبیق محصولات دریافتی با دارایی‌های سامانه" />
    {cashPanel}
    {canSync && <Button onClick={sync} isLoading={busy} disabled={busy || syncCooldownSeconds > 0}><RefreshCw className="ml-2 h-4 w-4"/>{syncCooldownSeconds > 0 ? ` دریافت مجدد پس از ${formatFaNumber(syncCooldownSeconds)} ثانیه` : ' دریافت محصولات از Connect'}</Button>}
    {feedback && <p role="status" className="rounded border p-3">{feedback}</p>}{syncIssues.length > 0 && <details className="rounded border p-3 text-sm"><summary className="cursor-pointer">جزئیات پالایش محصولات (بدون نمایش مقادیر فیلدها)</summary>{syncIssues.map((issue, index) => <p key={`${issue.index}-${issue.field}-${index}`}>محصول {issue.index ?? "نامشخص"}، فیلد {issue.field}: {labels[issue.errorCode] ?? issue.errorCode}؛ نوع داده {issue.receivedType}{issue.reason ? `؛ دلیل: ${labels[issue.reason] ?? issue.reason}` : ""}</p>)}</details>}
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['کل محصولات', syncInfo?.totalCount ?? count()], ['معتبر', count('VALID')], ['ناسازگار', count('INVALID')], ['نگاشت‌شده', syncInfo?.mappedCount ?? 0]].map(([label, value]) => <Card key={String(label)}><CardContent className="p-4"><div>{label}</div><strong>{formatFaNumber(Number(value))}</strong></CardContent></Card>)}</section>
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)]"><Card className="min-w-0"><CardHeader><CardTitle>فهرست محصولات</CardTitle></CardHeader><CardContent className="min-w-0 space-y-3">
      <div className="flex flex-wrap gap-2"><label className="relative"><Search className="absolute right-3 top-3 h-4 w-4"/><Input className="pr-9" value={search} placeholder="جست‌وجوی نام یا شناسهٔ محصول" onChange={e => {setSearch(e.target.value); setPage(1);}}/></label><select value={validationStatus} onChange={e=>{setValidation(e.target.value);setPage(1);}}><option value="">همهٔ وضعیت‌ها</option>{['VALID','PARTIAL','INVALID'].map(v=><option key={v} value={v}>{labels[v]}</option>)}</select><select value={mappingStatus} onChange={e=>{setMappingStatus(e.target.value);setPage(1);}}><option value="">همهٔ نگاشت‌ها</option><option value="MAPPED">نگاشت‌شده</option><option value="UNMAPPED">بدون نگاشت</option></select><select value={active} onChange={e=>{setActive(e.target.value);setPage(1);}}><option value="">همهٔ وضعیت‌های فعالیت</option><option value="ACTIVE">فعال</option><option value="INACTIVE">غیرفعال</option></select></div>
      {error && <p role="alert">دریافت فهرست انجام نشد.</p>}{isLoading ? <p>در حال دریافت فهرست…</p> : <div className="overflow-x-auto"><table className="w-full table-fixed text-right text-sm"><thead><tr>{['ردیف','محصول','شناسهٔ محصول','آخرین خرید معتبر','آخرین فروش معتبر','اعتبارسنجی','وضعیت فعالیت','نگاشت'].map(x=><th className="p-2" key={x}>{x}</th>)}</tr></thead><tbody>{data?.items.map((p,index)=><tr key={p.id} onClick={()=>choose(p)} role="button" aria-label={p.title ?? p.externalProductId} tabIndex={0} onKeyDown={e=>{if(e.key === "Enter" || e.key === " ") choose(p)}} className="cursor-pointer border-b hover:bg-muted/40"><td className="p-2">{formatFaNumber((page - 1) * query.pageSize + index + 1)}</td><td className="break-words p-2">{p.title || 'عنوان نامشخص'}</td><td className="break-all p-2" dir="ltr">{p.externalProductId}</td><td className="p-2">{price(p.buyPrice)}</td><td className="p-2">{price(p.sellPrice)}</td><td className="p-2">{(p.validationStatus === 'PARTIAL' ? 'ناسازگار یا ناقص' : labels[p.validationStatus])}</td><td className="p-2">{p.isActive == null ? 'نامشخص' : p.isActive ? 'فعال' : 'غیرفعال'}</td><td className="p-2">{p.mapping ? p.mapping.isVerified ? 'تأییدشده' : 'پیش‌نویس' : 'ندارد'}</td></tr>)}</tbody></table></div>}
      <div className="flex items-center gap-3"><span>{formatFaNumber(data?.total ?? 0)} محصول — صفحه {formatFaNumber(page)} از {formatFaNumber(Math.max(1, data?.pageCount ?? 1))}</span><Button variant="outline" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>قبلی</Button><Button variant="outline" disabled={page >= (data?.pageCount ?? 1)} onClick={() => setPage((current) => current + 1)}>بعدی</Button></div>
    </CardContent></Card><Card><CardHeader><CardTitle>جزئیات و نگاشت</CardTitle></CardHeader><CardContent className="space-y-3">{!selected ? <p>برای مشاهدهٔ جزئیات، یک محصول انتخاب کنید.</p> : <><h2>{selected.title}</h2><p dir="ltr">{selected.externalProductId}</p><p>آخرین قیمت معتبر: {price(selected.buyPrice)} / {price(selected.sellPrice)}</p><p>واحد نامشخص</p>{selected.lastValidationErrors.map((x,i)=><p key={i}>{labels[x.errorCode] ?? x.errorCode} ؛ نوع داده {x.receivedType}{x.reason ? `؛ دلیل: ${labels[x.reason] ?? x.reason}` : ""}</p>)}
      <label>نوع دارایی داخلی<select disabled={!canManage} value={mapping.internalAssetType ?? ''} onChange={e=>update('internalAssetType',e.target.value)}><option value="">انتخاب کنید</option><option value="INTERNAL_GOLD_WEIGHT">طلای داخلی برحسب وزن و عیار نسبی</option><option value="UNSUPPORTED">در حال حاضر پشتیبانی نمی‌شود</option></select></label>
      <label className="block">دستهٔ قیمت نقد<select className="mr-2 h-10 rounded border px-2" disabled={!canManage} value={mapping.cashPriceCategory ?? ''} onChange={e=>update('cashPriceCategory',e.target.value)}><option value="">محصول نقد نیست</option><option value="CASH_SPOT">نقد حاضر</option><option value="CASH_TOMORROW">نقد فردا</option><option value="CASH_DAY_AFTER_TOMORROW">نقد پس‌فردا</option></select></label>
      {([['internalGoldPurity','عیار نسبی داخلی (۰ تا ۱)'],['externalQuantityUnit','واحد مقدار Connect'],['externalPriceCurrency','واحد پول قیمت'],['priceUnitBasis','مبنای قیمت'],['conversionFactor','ضریب تبدیل']] as const).map(([key,label])=><label className="block" key={key}>{label}<Input disabled={!canManage} value={mapping[key] ?? ''} onChange={e=>update(key,e.target.value)} inputMode={key==='internalGoldPurity'||key==='conversionFactor'?'decimal':undefined}/></label>)}
      <label className="block">جهت قیمت خرید Connect<select disabled={!canManage} value={mapping.connectBuySide ?? ''} onChange={e=>update('connectBuySide',e.target.value)}><option value="">انتخاب کنید</option><option value="INTERNAL_BUY">خرید داخلی</option><option value="INTERNAL_SELL">فروش داخلی</option></select></label>
      <label className="block">جهت قیمت فروش Connect<select disabled={!canManage} value={mapping.connectSellSide ?? ''} onChange={e=>update('connectSellSide',e.target.value)}><option value="">انتخاب کنید</option><option value="INTERNAL_BUY">خرید داخلی</option><option value="INTERNAL_SELL">فروش داخلی</option></select></label>
      {mapping.externalPriceCurrency === 'TOMAN' && <p className="text-xs text-muted-foreground">واحد قیمت خام Connect: تومان؛ مقدار خام بدون تبدیل ذخیره می‌شود.</p>}{canManage && <Button variant="outline" disabled={busy} onClick={()=>save()}>ذخیرهٔ پیش‌نویس</Button>}{canVerify && <><Button disabled={busy || mapping.isVerified || verifyInFlight.current || !mapping.id || selected.validationStatus!=='VALID' || selected.presenceStatus!=='SEEN' || !mapping.connectBuySide || !mapping.connectSellSide || mapping.connectBuySide===mapping.connectSellSide} onClick={()=>save(true)}><ShieldCheck className="ml-2 h-4 w-4"/>{mapping.isVerified ? 'نگاشت تأیید شده است' : 'تأیید نگاشت'}</Button>{!mapping.id && <p className="text-sm text-amber-700">برای تأیید، ابتدا پیش‌نویس نگاشت را ذخیره کنید.</p>}{mapping.id && (!mapping.connectBuySide || !mapping.connectSellSide || mapping.connectBuySide===mapping.connectSellSide) && <p className="text-sm text-amber-700">برای تأیید، جهت خرید و فروش Connect را جداگانه و مطابق قرارداد تأییدشده تعیین کنید.</p>}</>}</>}</CardContent></Card></section>
    <p className="text-xs">این صفحه فقط کاتالوگ و نگاشت مدیریتی را نگه می‌دارد.</p>
  </main>;
}
