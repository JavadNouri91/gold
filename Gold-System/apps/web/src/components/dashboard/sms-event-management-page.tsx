'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Check, ChevronDown, ChevronUp, Eye, FlaskConical, Pencil, Search, Send, X } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { smsSettingsApi, type SmsEventSettingView } from '@/lib/internal-api';

const FIELD_LABELS: Record<string, string> = {
  code: 'کد تأیید', customerName: 'نام مشتری', mobile: 'شماره موبایل', date: 'تاریخ رویداد',
  eventDate: 'تاریخ رویداد', orderId: 'شناسه سفارش', orderNumber: 'شماره سفارش', orderType: 'نوع سفارش',
  weight: 'وزن طلا', amount: 'مبلغ', status: 'وضعیت', transactionId: 'شماره تراکنش',
  kycStatus: 'وضعیت احراز هویت', action: 'نوع تغییر', tradeNumber: 'شماره معامله',
};
const FIELD_GROUPS: Record<string, string> = {
  code: 'احراز هویت', customerName: 'مشتری', mobile: 'مشتری', date: 'رویداد', eventDate: 'رویداد',
  orderId: 'سفارش', orderNumber: 'سفارش', orderType: 'سفارش', weight: 'سفارش', amount: 'مالی', status: 'وضعیت',
  transactionId: 'مالی', kycStatus: 'احراز هویت', action: 'حساب کاربری', tradeNumber: 'معامله',
};
const STATUS_LABELS: Record<SmsEventSettingView['status'], string> = {
  enabled: 'آماده ارسال', disabled: 'غیرفعال', incomplete: 'نیازمند تنظیم',
};
const STATUS_STYLES: Record<SmsEventSettingView['status'], string> = {
  enabled: 'bg-emerald-50 text-emerald-700', disabled: 'bg-muted text-muted-foreground', incomplete: 'bg-amber-50 text-amber-800',
};
const SAMPLE_VALUES: Record<string, string> = {
  code: '۱۲۳۴۵۶', customerName: 'مشتری نمونه', mobile: '۰۹۱۲***۱۲۳۴', date: '۱۴۰۵/۰۸/۱۶',
  eventDate: '۱۴۰۵/۰۸/۱۶', orderId: 'ORD-1024', orderNumber: 'ORD-1024', orderType: 'خرید',
  weight: '۲٫۵۰', amount: '۱۲٬۵۰۰٬۰۰۰', status: 'تأیید شد', transactionId: 'TX-2048',
  kycStatus: 'تأیید شد', action: 'به‌روزرسانی شد', tradeNumber: 'TRD-1024',
};

type Draft = Omit<Pick<SmsEventSettingView, 'enabled' | 'recipientPolicy' | 'templateCode' | 'parameterFields' | 'sendingMode'>, 'templateCode'> & { templateCode: string; customMessage: string };
function initialDraft(event: SmsEventSettingView): Draft {
  return {
    enabled: event.enabled, recipientPolicy: event.recipientPolicy, templateCode: event.templateCode ?? '',
    parameterFields: [...event.parameterFields], sendingMode: event.sendingMode ?? 'provider_template',
    customMessage: event.customMessage ?? '',
  };
}
function preview(text: string, allowedFields: string[]) {
  const unresolved: string[] = [];
  const rendered = text.replace(/\{([^{}]+)\}/g, (_token, key: string) => {
    if (!allowedFields.includes(key) || !(key in SAMPLE_VALUES)) { unresolved.push(key); return `⟦${key}⟧`; }
    return SAMPLE_VALUES[key];
  });
  const malformed = /[{}]/.test(rendered.replace(/⟦[^⟧]+⟧/g, ''));
  return { rendered, unresolved, malformed };
}
function eventIsReady(event: SmsEventSettingView, draft: Draft) {
  if (event.mandatory) return event.status === 'enabled';
  if (!event.providerReady || !draft.enabled) return false;
  if (draft.sendingMode === 'provider_template') return Boolean(draft.templateCode.trim()) && draft.parameterFields.length > 0;
  const result = preview(draft.customMessage, event.allowedFields);
  return event.customTextVerified && Boolean(draft.customMessage.trim()) && !result.unresolved.length && !result.malformed;
}
function estimateSegments(text: string) {
  const gsmBasic = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  const gsmExtended = '^{}\\[~]|€';
  let units = 0;
  let gsm = true;
  for (const character of text) {
    if (gsmBasic.includes(character)) units += 1;
    else if (gsmExtended.includes(character)) units += 2;
    else { gsm = false; break; }
  }
  if (gsm) return units <= 160 ? 1 : Math.ceil(units / 153);
  const ucs2Units = [...text].reduce((total, character) => total + (character.codePointAt(0)! > 0xffff ? 2 : 1), 0);
  return ucs2Units <= 70 ? 1 : Math.ceil(ucs2Units / 67);
}
function updatedAtLabel(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
function latinDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩'.indexOf(digit) % 10));
}

export function SmsEventManagementPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user?.permissions, 'sms.settings.manage');
  const { data, error, isLoading, mutate } = useSWR(canManage ? 'sms-events' : null, () => smsSettingsApi.events());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [active, setActive] = useState<SmsEventSettingView | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [filter, setFilter] = useState('all');
  const [configurationFilter, setConfigurationFilter] = useState('all');
  const [mobile, setMobile] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!data) return;
    setDrafts((old) => Object.fromEntries(data.map((event) => [event.id, old[event.id] ?? initialDraft(event)])));
  }, [data]);
  const categories = useMemo(() => [...new Set((data ?? []).map((event) => event.category))], [data]);
  const visible = (data ?? []).filter((event) => {
    const draft = drafts[event.id] ?? initialDraft(event);
    const matchesSearch = `${event.name} ${event.id} ${event.description}`.toLowerCase().includes(search.toLowerCase());
    const readinessMatch = configurationFilter === 'all' || (configurationFilter === 'ready' ? eventIsReady(event, draft) : !eventIsReady(event, draft));
    return matchesSearch && (category === 'all' || event.category === category) && readinessMatch &&
      (filter === 'all' || (filter === 'enabled' ? draft.enabled : filter === 'disabled' ? !draft.enabled : draft.sendingMode === filter));
  });
  if (!canManage) return <ForbiddenNotice permission="sms.settings.manage" />;

  function update(event: SmsEventSettingView, patch: Partial<Draft>) {
    setDrafts((old) => ({ ...old, [event.id]: { ...(old[event.id] ?? initialDraft(event)), ...patch } }));
  }
  function addVariable(event: SmsEventSettingView, field: string) {
    const node = messageRef.current;
    const draft = drafts[event.id] ?? initialDraft(event);
    const token = `{${field}}`;
    const start = node?.selectionStart ?? draft.customMessage.length;
    const end = node?.selectionEnd ?? start;
    const next = `${draft.customMessage.slice(0, start)}${token}${draft.customMessage.slice(end)}`;
    update(event, { customMessage: next });
    requestAnimationFrame(() => { node?.focus(); node?.setSelectionRange(start + token.length, start + token.length); });
  }
  async function save(event: SmsEventSettingView) {
    const draft = drafts[event.id] ?? initialDraft(event);
    setSaving(true); setNotice(''); setErrorMessage('');
    try {
      await smsSettingsApi.updateEvent(event.id, {
        ...draft, enabled: event.mandatory ? true : draft.enabled,
        recipientPolicy: event.mandatory ? 'USER' : draft.recipientPolicy,
        sendingMode: event.mandatory ? 'provider_template' : draft.sendingMode,
        customMessage: event.mandatory ? '' : draft.customMessage,
      });
      await mutate(); setNotice(`تنظیمات «${event.name}» ذخیره شد.`); setActive(null);
    } catch (e) { setErrorMessage(e instanceof Error ? e.message : 'ذخیره تنظیمات انجام نشد.'); }
    finally { setSaving(false); }
  }
  async function sendTest(event: SmsEventSettingView) {
    const destination = latinDigits(mobile).replace(/\D/g, '');
    if (!/^09\d{9}$/.test(destination)) { setErrorMessage('شماره مقصد باید یک شماره موبایل معتبر ایران باشد.'); return; }
    if (!window.confirm(`پیام آزمایشی با مقادیر نمونه به ${destination} ارسال شود؟`)) return;
    setSending(true); setErrorMessage(''); setNotice('');
    try {
      const current = drafts[event.id] ?? initialDraft(event);
      const result = await smsSettingsApi.testEvent(event.id, destination, {
        sendingMode: event.mandatory ? 'provider_template' : current.sendingMode,
        parameterFields: current.parameterFields,
        templateCode: current.templateCode,
        customMessage: current.customMessage,
      });
      if (result.success) {
        await mutate();
        setNotice(`درخواست ارسال آزمایشی توسط سرویس پذیرفته شد${result.providerReference ? `؛ شناسه: ${result.providerReference}` : ''}. پذیرش به معنی تحویل پیام نیست.`);
      }
      else setErrorMessage(result.error || 'سرویس پیامک درخواست آزمایشی را نپذیرفت.');
    } catch (e) { setErrorMessage(e instanceof Error ? e.message : 'ارسال آزمایشی انجام نشد.'); }
    finally { setSending(false); }
  }
  async function refreshStatus(event: SmsEventSettingView) {
    setRefreshing(true); setErrorMessage(''); setNotice('');
    try { const result = await smsSettingsApi.refreshEventStatus(event.id); setNotice(`وضعیت ${result.updated} پیام از ${result.checked} شناسه به‌روزرسانی شد.`); }
    catch (e) { setErrorMessage(e instanceof Error ? e.message : 'به‌روزرسانی وضعیت تحویل انجام نشد.'); }
    finally { setRefreshing(false); }
  }

  const draft = active ? (drafts[active.id] ?? initialDraft(active)) : null;
  const isDirty = active && draft ? JSON.stringify(draft) !== JSON.stringify(initialDraft(active)) : false;
  function closeEditor() {
    if (isDirty && !window.confirm('تغییرات ذخیره‌نشده هستند. بدون ذخیره خارج می‌شوید؟')) return;
    setActive(null);
  }
  const renderedPreview = draft && active ? preview(draft.customMessage, active.allowedFields) : null;
  const selectedFields = draft?.parameterFields ?? [];
  const templatePreviewFields = active ? selectedFields.map((field) => SAMPLE_VALUES[field] ?? `⟦${field}⟧`) : [];
  return <div dir="rtl" className="space-y-5">
    <PageHeader title="مدیریت رویدادهای پیامکی" description="تنظیم پیام‌های خودکار سامانه، قالب‌ها و روش ارسال" />
    <Card className="p-4 text-sm leading-7 text-muted-foreground">
      پیامک‌های OTP اجباری مستقل از اعلان‌های اختیاری هستند و از این صفحه غیرفعال نمی‌شوند. متغیرها فقط از داده‌های مجاز همان رویداد پر می‌شوند. تغییر وضعیت رویدادها پیامک واقعی ارسال نمی‌کند.
    </Card>
    {notice && <Alert variant="info">{notice}</Alert>}{errorMessage && <Alert variant="error">{errorMessage}</Alert>}
    {error && <Alert variant="error">بارگذاری رویدادها انجام نشد.</Alert>}
    <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(150px,210px))]">
      <div className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="جست‌وجوی رویداد" className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جست‌وجوی نام یا شناسه رویداد" /></div>
      <select aria-label="دسته‌بندی" className="h-10 rounded-md border bg-background px-3" value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">همه دسته‌ها</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
      <select aria-label="فیلتر رویدادها" className="h-10 rounded-md border bg-background px-3" value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="all">همه وضعیت‌ها</option><option value="enabled">فعال</option><option value="disabled">غیرفعال</option><option value="provider_template">قالب HiSMS</option><option value="custom_text">متن سفارشی</option>
      </select>
      <select aria-label="وضعیت پیکربندی" className="h-10 rounded-md border bg-background px-3" value={configurationFilter} onChange={(e) => setConfigurationFilter(e.target.value)}><option value="all">همه وضعیت‌های پیکربندی</option><option value="ready">آماده ارسال</option><option value="incomplete">نیازمند تنظیم</option></select>
    </div>
    {isLoading && <p className="text-sm text-muted-foreground">در حال بارگذاری رویدادها…</p>}
    <Card className="overflow-hidden">
      <div className="hidden grid-cols-[minmax(170px,1.5fr)_minmax(120px,1fr)_120px_100px_140px_130px_110px] gap-3 border-b bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground lg:grid"><span>رویداد</span><span>دسته</span><span>روش ارسال</span><span>وضعیت</span><span>پیکربندی</span><span>آخرین تغییر</span><span>عملیات</span></div>
      <div className="divide-y">
        {visible.map((event) => {
          const current = drafts[event.id] ?? initialDraft(event);
          const ready = eventIsReady(event, current);
          const configStatus = !current.enabled && !event.mandatory ? 'غیرفعال' : ready ? 'آماده ارسال' : 'نیازمند تنظیم';
          return <div key={event.id} className="grid gap-2 px-4 py-3 text-sm lg:grid-cols-[minmax(170px,1.5fr)_minmax(120px,1fr)_120px_100px_140px_130px_110px] lg:items-center lg:gap-3">
            <div><div className="font-medium">{event.name}{event.mandatory && <span className="mr-2 rounded bg-sky-50 px-2 py-0.5 text-[10px] text-sky-700">اجباری</span>}</div><code dir="ltr" className="text-[11px] text-muted-foreground">{event.id}</code></div>
            <span className="text-muted-foreground">{event.category}</span><span>{current.sendingMode === 'custom_text' ? 'متن سفارشی' : 'قالب HiSMS'}</span>
            <span>{event.mandatory ? 'اجباری' : current.enabled ? 'فعال' : 'غیرفعال'}</span>
            <span className={`w-fit rounded-full px-2.5 py-1 text-xs ${ready ? STATUS_STYLES.enabled : !current.enabled && !event.mandatory ? STATUS_STYLES.disabled : STATUS_STYLES.incomplete}`}>{configStatus}</span>
            <span className="text-xs text-muted-foreground">{updatedAtLabel(event.updatedAt)}</span>
            <Button variant="outline" size="sm" onClick={() => { setErrorMessage(''); setActive(event); }}><Pencil className="ml-1 h-4 w-4" />ویرایش</Button>
          </div>;
        })}
        {!visible.length && !isLoading && <p className="p-8 text-center text-sm text-muted-foreground">رویدادی با این فیلترها پیدا نشد.</p>}
      </div>
    </Card>

    <Modal open={Boolean(active)} onClose={closeEditor} title={active ? `ویرایش رویداد: ${active.name}` : undefined} rootClassName="items-stretch justify-end" className="h-full max-h-screen max-w-3xl overflow-y-auto rounded-none p-0 sm:rounded-r-2xl">
      {active && draft && <div className="flex min-h-full flex-col">
        <div className="flex items-start justify-between border-b p-5"><div><p className="text-sm text-muted-foreground">{active.description}</p><code dir="ltr" className="text-xs text-muted-foreground">{active.id}</code></div><Button variant="ghost" size="sm" aria-label="بستن ویرایشگر" onClick={closeEditor}><X className="h-4 w-4" /></Button></div>
        {isDirty && <p className="mx-5 mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">تغییرات ذخیره‌نشده دارید.</p>}
        <div className="flex-1 space-y-6 p-5">
          <section className="space-y-3"><h3 className="font-semibold">تنظیمات عمومی</h3>
            {!active.mandatory ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={(e) => update(active, { enabled: e.target.checked })} />فعال‌سازی اعلان این رویداد</label> : <p className="rounded-md bg-sky-50 p-3 text-sm text-sky-900">OTP این رویداد بخشی از احراز هویت اجباری است و از اینجا غیرفعال نمی‌شود.</p>}
            <div className="rounded-md border bg-muted/20 p-3"><span className="text-xs text-muted-foreground">شناسه ثابت رویداد</span><div dir="ltr" className="mt-1 font-mono text-sm">{active.id}</div></div>
            <label className="block space-y-1 text-sm"><span>گیرندگان</span><select aria-label="گیرندگان پیامک" disabled={active.mandatory} className="h-10 w-full rounded-md border bg-background px-3" value={active.mandatory ? 'USER' : draft.recipientPolicy} onChange={(e) => update(active, { recipientPolicy: e.target.value as Draft['recipientPolicy'] })}><option value="USER">کاربر مرتبط</option><option value="ADMIN">مدیران مجاز پیامک</option><option value="BOTH">کاربر و مدیران مجاز</option></select></label>
          </section>
          {!active.mandatory && <section className="space-y-3"><h3 className="font-semibold">روش ارسال</h3><div className="grid gap-2 sm:grid-cols-2">
            {(['provider_template', 'custom_text'] as const).map((mode) => <label key={mode} className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${draft.sendingMode === mode ? 'border-gold-500 bg-gold-50/50' : ''}`}><input type="radio" name="sending-mode" checked={draft.sendingMode === mode} onChange={() => update(active, { sendingMode: mode })} /><span><b>{mode === 'provider_template' ? 'قالب تأییدشده HiSMS' : 'متن سفارشی'}</b><span className="mt-1 block text-xs text-muted-foreground">{mode === 'provider_template' ? 'ارسال با قالب از پیش تأییدشده در پنل HiSMS' : 'ارسال متن معمولی از خط فرستنده؛ پشتیبانی خط باید تأیید شده باشد.'}</span></span></label>)}
          </div></section>}
          {draft.sendingMode === 'provider_template' || active.mandatory ? <section className="space-y-4"><h3 className="font-semibold">تنظیم قالب و پارامترها</h3><Input label="کد قالب HiSMS" dir="ltr" value={draft.templateCode} maxLength={100} onChange={(e) => update(active, { templateCode: e.target.value })} hint="ترتیب پارامترها باید دقیقاً با قالب تعریف‌شده در پنل HiSMS یکسان باشد." />
            <fieldset className="space-y-2"><legend className="text-sm font-medium">پارامترهای مجاز و ترتیب ارسال</legend><div className="space-y-2">{active.allowedFields.map((field) => { const index = selectedFields.indexOf(field); return <div key={field} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input aria-label={`انتخاب ${FIELD_LABELS[field] ?? field}`} disabled={active.mandatory} type="checkbox" checked={index >= 0} onChange={(e) => update(active, { parameterFields: e.target.checked ? [...selectedFields, field] : selectedFields.filter((v) => v !== field) })} /><span className="flex-1">{FIELD_LABELS[field] ?? field} <code dir="ltr" className="text-xs text-muted-foreground">{`{${field}}`}</code></span>{index >= 0 && <><span className="text-xs text-muted-foreground">جایگاه {index + 1}</span><Button variant="ghost" size="icon" aria-label="جابجایی به بالا" disabled={active.mandatory || index === 0} onClick={() => { const next = [...selectedFields]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; update(active, { parameterFields: next }); }}><ChevronUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="جابجایی به پایین" disabled={active.mandatory || index === selectedFields.length - 1} onClick={() => { const next = [...selectedFields]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; update(active, { parameterFields: next }); }}><ChevronDown className="h-4 w-4" /></Button></>}</div>; })}</div><p className="text-xs text-amber-700">تعداد و ترتیب پارامترها باید مطابق قالب ثبت‌شده در HiSMS باشد؛ متن قالب ارائه‌دهنده از اینجا قابل مشاهده نیست.</p></fieldset>
            {selectedFields.length > 0 && <div id="sms-message-preview" className="rounded-md bg-muted p-3 text-sm"><b>پیش‌نمایش پارامترها با داده نمونه</b><ol className="mt-2 list-inside list-decimal">{templatePreviewFields.map((value, i) => <li key={`${i}-${value}`}><code dir="ltr">{value}</code></li>)}</ol></div>}
          </section> : <section className="space-y-3"><h3 className="font-semibold">متن پیامک سفارشی</h3><Textarea ref={messageRef} label="متن پیام" dir="rtl" rows={5} maxLength={1000} value={draft.customMessage} onChange={(e) => update(active, { customMessage: e.target.value })} hint="از دکمه‌های متغیر برای درج امن داده‌های رویداد استفاده کنید. حداکثر ۱۰۰۰ نویسه." />
            <div className="space-y-3"><span className="block text-xs font-medium text-muted-foreground">متغیرهای مجاز این رویداد؛ برای درج در محل نشانگر کلیک کنید</span>{[...new Set(active.allowedFields.map((field) => FIELD_GROUPS[field] ?? 'سایر'))].map((group) => <div key={group} className="space-y-1.5"><span className="text-xs text-muted-foreground">{group}</span><div className="flex flex-wrap gap-2">{active.allowedFields.filter((field) => (FIELD_GROUPS[field] ?? 'سایر') === group).map((field) => <Button key={field} type="button" variant="outline" size="sm" onClick={() => addVariable(active, field)} title={FIELD_LABELS[field] ?? field}>{FIELD_LABELS[field] ?? field} <code dir="ltr" className="mr-1 text-xs">{`{${field}}`}</code></Button>)}</div></div>)}</div>
            <div id="sms-message-preview" className="rounded-lg border bg-muted/20 p-4"><div className="mb-2 flex items-center justify-between"><b className="text-sm">پیش‌نمایش پیام</b><span className="text-xs text-muted-foreground">فقط داده نمونه؛ پیام واقعی در سرور ساخته می‌شود</span></div><p className="min-h-12 whitespace-pre-wrap rounded-md bg-background p-3 text-sm leading-7">{renderedPreview?.rendered || 'متن پیام را وارد کنید.'}</p><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{draft.customMessage.length} نویسه · حدود {draft.customMessage.length ? estimateSegments(renderedPreview?.rendered ?? draft.customMessage) : 0} بخش پیامک (تخمینی)</span>{renderedPreview?.unresolved.length ? <span className="text-amber-700">متغیر ناشناخته: {renderedPreview.unresolved.join('، ')}</span> : renderedPreview?.malformed ? <span className="text-red-600">ساختار متغیر ناقص است.</span> : <span>بدون متغیر ناشناخته</span>}</div></div>
            <p className="text-xs text-amber-700">ارسال اعلان‌های متن سفارشی تا پذیرش موفق یک پیام آزمایشی از خط فعلی فعال نمی‌شود. تغییر تنظیمات عمومی سرویس این تأیید را باطل می‌کند.</p>
          </section>}
          {!active.mandatory && <section className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold">ارسال آزمایشی</h3><p className="text-sm text-muted-foreground">پیش از ارسال، نمونه پیام بالا و شماره مقصد را بررسی کنید. پیام از همین روش انتخاب‌شده و با مقادیر نمونه ارسال می‌شود.</p><Input label="شماره موبایل مقصد" type="tel" inputMode="numeric" dir="ltr" placeholder="09123456789" value={mobile} onChange={(e) => setMobile(e.target.value)} /><Button variant="outline" disabled={sending || (!draft.customMessage.trim() && draft.sendingMode === 'custom_text') || (!draft.templateCode.trim() && draft.sendingMode === 'provider_template')} isLoading={sending} onClick={() => void sendTest(active)}><Send className="ml-2 h-4 w-4" />ارسال پیامک آزمایشی</Button></section>}
          {active.status !== 'incomplete' && <div className={`rounded-md px-3 py-2 text-sm ${STATUS_STYLES[active.status]}`}>وضعیت ذخیره‌شده: {STATUS_LABELS[active.status]}</div>}
        </div>
        <div className="sticky bottom-0 flex flex-wrap justify-between gap-2 border-t bg-background p-4"><div className="flex flex-wrap gap-2"><Button onClick={() => void save(active)} isLoading={saving} disabled={saving}><Check className="ml-2 h-4 w-4" />ذخیره تغییرات</Button><Button variant="outline" onClick={() => document.getElementById('sms-message-preview')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Eye className="ml-2 h-4 w-4" />پیش‌نمایش</Button><Button variant="outline" onClick={closeEditor}>انصراف</Button></div><Button variant="outline" isLoading={refreshing} disabled={refreshing} onClick={() => void refreshStatus(active)}><FlaskConical className="ml-2 h-4 w-4" />به‌روزرسانی وضعیت تحویل</Button></div>
      </div>}
    </Modal>
  </div>;
}
