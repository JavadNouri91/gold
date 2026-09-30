'use client';

import { useState, useEffect } from 'react';
import React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Modal } from '@/components/ui/modal';
import { ApiClientError } from '@/lib/api';
import { internalCustomersApi, type StaffCustomer } from '@/lib/internal-api';
import { isValidMobile, latinMobile, isValidNationalId, latinNationalId, isValidEmail, toPersianDigits, latinPhone, MOBILE_PLACEHOLDER } from '@/lib/utils';
import { MobileInput } from '@/components/ui/mobile-input';
import { NationalIdInput } from '@/components/ui/national-id-input';
import { PostalCodeInput } from '@/components/ui/postal-code-input';
import {
  Building2,
  User,
  Phone,
  FileText,
  CheckCircle,
  Mail,
  MapPin,
  Smartphone,
  PhoneCall,
  Contact2,
} from 'lucide-react';
import { getCitiesForProvince, getProvinceNames } from '@/lib/iran-provinces';
import { DatePickerJalali } from '@/components/ui/date-picker-jalali';
import { GenderPicker } from '@/components/ui/gender-picker';
import { PasswordInput } from '@/components/ui/password-input';
import { SearchableSelect } from '@/components/ui/searchable-select';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RegisterCustomerFormValues {
  // Step 1 — Identity
  firstName: string;
  lastName: string;
  nationalId: string;
  mobile: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  type: string;
  initialAccountStatus: string;
  level: string;
  password: string;
  companyName: string;
  companyNationalId: string;
  companyEconomicId: string;
  contactName: string;
  contactTitle: string;
  // Step 2 — Contact
  phone: string;
  province: string;
  city: string;
  postalCode: string;
  address: string;
  secondaryMobile: string;
  workPhone: string;
  fax: string;
  workAddress: string;
  contactNotes: string;
  // Step 3 — Supplementary
  verificationStatus: string;
  referenceSource: string;
  internalNote: string;
}

function registrationError(err: unknown): string {
  if (!(err instanceof ApiClientError)) return 'ثبت مشتری انجام نشد.';
  if (/mobile/i.test(err.message)) return 'این شماره موبایل قبلاً ثبت شده است.';
  if (/national/i.test(err.message)) return 'این کد ملی قبلاً ثبت شده است.';
  if (/email/i.test(err.message)) return 'این ایمیل قبلاً در سیستم ثبت شده است.';
  return err.message;
}

// ─── Step sidebar ─────────────────────────────────────────────────────────────

const STEPS = [
  { num: 1, label: 'اطلاعات پایه', desc: 'اطلاعات هویتی و نوع مشتری' },
  { num: 2, label: 'اطلاعات تماس', desc: 'آدرس و راه‌های ارتباطی' },
  { num: 3, label: 'اطلاعات تکمیلی', desc: 'وضعیت، یادداشت و سایر موارد' },
] as const;

function StepSidebar({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex flex-col gap-3">
      {STEPS.map((step) => {
        const done = step.num < current;
        const active = step.num === current;
        return (
          <div
            key={step.num}
            className={`rounded-xl border p-3 transition-colors ${
              active
                ? 'border-gold-400 bg-gold-50'
                : done
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-transparent bg-muted/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  active
                    ? 'bg-gold-500 text-white'
                    : done
                      ? 'bg-emerald-500 text-white'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {done ? '✓' : step.num}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold leading-tight ${
                    active ? 'text-gold-800' : done ? 'text-emerald-800' : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                </p>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                  {step.desc}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── SelectField ──────────────────────────────────────────────────────────────

// React.forwardRef is required so that RHF's ref callback reaches
// the native <select> element — without it, register() cannot read
// the value and required validation always fails.
const SelectField = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    label?: string;
    error?: string;
    required?: boolean;
    hint?: string;
  }
>(function SelectField({ label, error, required, hint, children, id, ...props }, ref) {
  const fieldId = id ?? label;
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={fieldId} className="block text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-red-500 ms-1">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={fieldId}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-err` : undefined}
          className={`h-10 w-full appearance-none rounded-md border bg-background ps-3 pe-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:cursor-not-allowed disabled:opacity-50 ${
            error ? 'border-red-500' : 'border-input'
          }`}
          {...props}
        >
          {children}
        </select>
        {/* caret */}
        <span className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center text-muted-foreground">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </div>
      {error && (
        <p id={`${fieldId}-err`} className="text-xs text-red-600">
          {error}
        </p>
      )}
      {!error && hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
});

// ─── InputWithIcon ────────────────────────────────────────────────────────────

function InputWithIcon({
  icon: Icon,
  label,
  error,
  hint,
  required,
  dir = 'ltr',
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ComponentType<{ className?: string }>;
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  dir?: 'ltr' | 'rtl';
}) {
  const fieldId = id ?? label ?? props.name;
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={fieldId} className="block text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-red-500 ms-1">*</span>}
        </label>
      )}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <input
          id={fieldId}
          dir={dir}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-err` : undefined}
          className={`flex h-10 w-full rounded-md border bg-background ps-9 pe-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:cursor-not-allowed disabled:opacity-50 ${
            error ? 'border-red-500' : 'border-input'
          }`}
          {...props}
        />
      </div>
      {error && (
        <p id={`${fieldId}-err`} className="text-xs text-red-600">
          {error}
        </p>
      )}
      {!error && hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── MobileInputWithIcon ──────────────────────────────────────────────────────

function MobileInputWithIcon({
  label,
  error,
  required,
  hint,
  value,
  onValueChange,
}: {
  label?: string;
  error?: string;
  required?: boolean;
  hint?: string;
  value?: string;
  onValueChange: (v: string) => void;
}) {
  const fieldId = label ?? 'mobile-with-icon';
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={fieldId} className="block text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-red-500 ms-1">*</span>}
        </label>
      )}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted-foreground z-10">
          <Smartphone className="h-4 w-4" />
        </span>
        <MobileInput
          className="ps-9"
          value={value}
          onValueChange={onValueChange}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-err` : undefined}
        />
      </div>
      {error && (
        <p id={`${fieldId}-err`} className="text-xs text-red-600">
          {error}
        </p>
      )}
      {!error && hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── TextareaField ────────────────────────────────────────────────────────────

function TextareaField({
  label,
  error,
  hint,
  required,
  maxLength,
  value,
  id,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}) {
  const len = typeof value === 'string' ? value.length : 0;
  const fieldId = id ?? label;
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={fieldId} className="block text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-red-500 ms-1">*</span>}
        </label>
      )}
      <textarea
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-err` : undefined}
        className={`w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:opacity-50 ${
          error ? 'border-red-500' : 'border-input'
        }`}
        value={value}
        maxLength={maxLength}
        {...props}
      />
      <div className="flex items-start justify-between gap-2">
        <div>
          {error ? (
            <p id={`${fieldId}-err`} className="text-xs text-red-600">
              {error}
            </p>
          ) : hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {maxLength != null && (
          <p className="text-xs text-muted-foreground shrink-0">
            {len.toLocaleString('fa-IR')} / {maxLength.toLocaleString('fa-IR')}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── CardSection ──────────────────────────────────────────────────────────────

function CardSection({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-4 space-y-4">
      {/* Card header */}
      <div className="flex items-center gap-3 pb-3 border-b border-border/60">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-50 border border-gold-100">
          <Icon className="h-4 w-4 text-gold-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── SectionHeader (step level) ───────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-100">
        <Icon className="h-4 w-4 text-gold-700" />
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RegisterCustomerButton({
  onCreated,
}: {
  onCreated: (customer: StaffCustomer) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [successCustomer, setSuccessCustomer] = useState<StaffCustomer | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const provinceNames = getProvinceNames();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    trigger,
    formState: { errors, isDirty },
  } = useForm<RegisterCustomerFormValues>({
    defaultValues: {
      firstName: '',
      lastName: '',
      nationalId: '',
      mobile: '',
      email: '',
      dateOfBirth: '',
      gender: '',
      type: 'HOUSEHOLD',
      initialAccountStatus: 'ACTIVE',
      level: 'NORMAL',
      password: '',
      companyName: '',
      companyNationalId: '',
      companyEconomicId: '',
      contactName: '',
      contactTitle: '',
      phone: '',
      province: '',
      city: '',
      postalCode: '',
      address: '',
      secondaryMobile: '',
      workPhone: '',
      fax: '',
      workAddress: '',
      contactNotes: '',
      verificationStatus: '',
      referenceSource: '',
      internalNote: '',
    },
  });

  // ── Pre-register controlled fields (no DOM element needed) ──────────────────

  register('mobile', {
    required: 'شماره موبایل الزامی است',
    validate: (v) => isValidMobile(v) || `فرمت شماره موبایل صحیح نیست (مثال: ${MOBILE_PLACEHOLDER})`,
  });

  register('nationalId', {
    required: 'کد ملی الزامی است',
    validate: (v) => {
      const latin = latinNationalId(v);
      if (latin.length !== 10) return 'کد ملی باید ۱۰ رقم باشد';
      if (!isValidNationalId(latin)) return 'کد ملی وارد‌شده معتبر نیست';
      return true;
    },
  });

  register('address', {
    required: 'وارد کردن آدرس الزامی است',
    minLength: { value: 5, message: 'آدرس باید حداقل ۵ کاراکتر باشد' },
    maxLength: { value: 500, message: 'آدرس بیش از حد طولانی است' },
  });

  register('postalCode', {
    required: 'کد پستی الزامی است',
    validate: (v) => /^\d{10}$/.test(v) || 'کد پستی باید ۱۰ رقم باشد',
  });

  register('secondaryMobile', {
    validate: (v) => !v || isValidMobile(v) || 'شماره موبایل واردشده معتبر نیست',
  });

  register('phone', {
    validate: (v) =>
      !v.trim() || (v.trim().length >= 8 && v.trim().length <= 20) || 'شماره تلفن معتبر نیست',
  });

  register('workPhone', {
    validate: (v) =>
      !v.trim() ||
      (v.trim().length >= 8 && v.trim().length <= 20) ||
      'شماره تلفن محل کار معتبر نیست',
  });

  register('fax', {
    validate: (v) =>
      !v.trim() || (v.trim().length >= 8 && v.trim().length <= 20) || 'شماره فکس معتبر نیست',
  });

  register('email', {
    validate: {
      format: (v) => !v.trim() || isValidEmail(v.trim()) || 'فرمت ایمیل معتبر نیست',
      unique: async (v) => {
        if (!v.trim() || !isValidEmail(v.trim())) return true; // skip: no format error yet
        try {
          const { available } = await internalCustomersApi.checkEmailAvailable(v.trim());
          return available || 'این ایمیل قبلاً در سیستم ثبت شده است';
        } catch {
          return true; // network error — let the server catch it on submit
        }
      },
    },
  });

  register('province', { required: 'انتخاب استان الزامی است' });
  register('city',     { required: 'انتخاب شهر الزامی است' });

  // ── Watched values ──────────────────────────────────────────────────────────

  const watchedType = watch('type');
  const watchedProvince = watch('province');
  const watchedAddress = watch('address');
  const watchedWorkAddress = watch('workAddress');
  const watchedContactNotes = watch('contactNotes');
  const watchedInternalNote = watch('internalNote');
  const isCorporate = watchedType === 'CORPORATE';

  const cityOptions = getCitiesForProvince(watchedProvince);

  // Reset city when province changes
  useEffect(() => {
    setValue('city', '');
  }, [watchedProvince, setValue]);

  // ── Close helpers ───────────────────────────────────────────────────────────

  const close = () => {
    if (isLoading) return;
    if (isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    doClose();
  };

  const doClose = () => {
    setOpen(false);
    setSubmitError(null);
    setStep(1);
    setSuccessCustomer(null);
    setShowCancelConfirm(false);
    reset();
  };

  // ── Step validation fields ──────────────────────────────────────────────────

  const step1Fields: (keyof RegisterCustomerFormValues)[] = [
    'firstName', 'lastName', 'nationalId', 'mobile',
    'type', 'initialAccountStatus', 'password',
    ...(isCorporate ? (['companyName', 'contactName'] as const) : []),
  ];

  const step2Fields: (keyof RegisterCustomerFormValues)[] = [
    'mobile', 'email', 'phone',
    'province', 'city', 'postalCode', 'address',
    'secondaryMobile', 'workPhone', 'fax',
  ];

  // ── Navigation ──────────────────────────────────────────────────────────────

  const goNext = async () => {
    const fields = step === 1 ? step1Fields : step === 2 ? step2Fields : [];
    const valid = await trigger(fields as (keyof RegisterCustomerFormValues)[]);
    if (!valid) {
      // Focus the first invalid element
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(
          '[aria-invalid="true"], [class*="border-red"]',
        );
        el?.focus();
      });
      return;
    }
    setStep((s) => Math.min(s + 1, 3) as 1 | 2 | 3);
    setSubmitError(null);
  };

  const goPrev = () => {
    setStep((s) => Math.max(s - 1, 1) as 1 | 2 | 3);
    setSubmitError(null);
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const onSubmit = async (data: RegisterCustomerFormValues) => {
    setSubmitError(null);
    setIsLoading(true);
    try {
        const customer = await internalCustomersApi.register({
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        nationalId: latinNationalId(data.nationalId),
        mobile: latinMobile(data.mobile),
        email: data.email.trim().toLowerCase() || undefined,
        dateOfBirth: data.dateOfBirth || undefined,
        password: data.password,
        type: data.type || undefined,
        gender: data.gender || undefined,
        level: data.level || undefined,
        initialAccountStatus: data.initialAccountStatus || undefined,
        ...(isCorporate && {
          companyName: data.companyName.trim() || undefined,
          companyNationalId: data.companyNationalId.trim() || undefined,
          companyEconomicId: data.companyEconomicId.trim() || undefined,
          contactName: data.contactName.trim() || undefined,
          contactTitle: data.contactTitle.trim() || undefined,
        }),
        phone: data.phone.trim() || undefined,
        province: data.province || undefined,
        city: data.city || undefined,
        postalCode: data.postalCode.trim() || undefined,
        address: data.address.trim() || undefined,
        secondaryMobile: data.secondaryMobile ? latinMobile(data.secondaryMobile) : undefined,
        workPhone: data.workPhone.trim() || undefined,
        fax: data.fax.trim() || undefined,
        workAddress: data.workAddress.trim() || undefined,
        contactNotes: data.contactNotes.trim() || undefined,
        referenceSource: data.referenceSource || undefined,
        internalNote: data.internalNote.trim() || undefined,
      });
      setSuccessCustomer(customer);
      onCreated(customer);
    } catch (err) {
      setSubmitError(registrationError(err));
    } finally {
      setIsLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Success screen
  // ─────────────────────────────────────────────────────────────────────────────

  if (successCustomer) {
    return (
      <>
        <Button type="button" onClick={() => setOpen(true)}>
          + ثبت مشتری
        </Button>
        <Modal open={open} onClose={doClose} title="ثبت مشتری جدید" className="max-w-md">
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <CheckCircle className="h-14 w-14 text-emerald-500" />
            <div>
              <p className="text-lg font-semibold text-emerald-700">مشتری با موفقیت ثبت شد.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                کد مشتری:{' '}
                <span dir="ltr" className="font-mono font-bold">
                  {successCustomer.customerNumber}
                </span>
              </p>
            </div>
            <div className="flex w-full gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => { window.location.href = `/dashboard/customers/${successCustomer.id}`; }}
              >
                مشاهده پروفایل
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => { window.location.href = `/dashboard/orders?customerId=${successCustomer.id}`; }}
              >
                ثبت سفارش جدید
              </Button>
            </div>
            <Button type="button" variant="ghost" onClick={doClose} className="w-full">
              بستن
            </Button>
          </div>
        </Modal>
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Cancel confirmation overlay
  // ─────────────────────────────────────────────────────────────────────────────

  const cancelConfirm = showCancelConfirm && (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-confirm-title"
    >
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowCancelConfirm(false)} />
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl mx-4">
        <h3 id="cancel-confirm-title" className="text-base font-semibold mb-2">
          انصراف از ثبت مشتری
        </h3>
        <p className="text-sm text-muted-foreground mb-5">
          اطلاعات واردشده ذخیره نخواهد شد. آیا مطمئن هستید؟
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setShowCancelConfirm(false)}>
            ادامه ثبت
          </Button>
          <Button type="button" variant="destructive" onClick={doClose}>
            انصراف
          </Button>
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Main form modal
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        + ثبت مشتری
      </Button>

      {cancelConfirm}

      <Modal
        open={open}
        onClose={close}
        className="max-h-[95vh] w-full max-w-3xl overflow-hidden p-0"
      >
        {/* ── Modal header ── */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-100">
              <User className="h-4 w-4 text-gold-700" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">ثبت مشتری جدید</h2>
              <p className="text-xs text-muted-foreground">اطلاعات مشتری را در مراحل زیر وارد کنید.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            aria-label="بستن"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Body (sidebar + content) ── */}
        <div className="flex min-h-0 flex-1 overflow-hidden" style={{ maxHeight: 'calc(95vh - 130px)' }}>
          {/* Sidebar — right side in RTL (first child = right) */}
          <div className="hidden w-52 shrink-0 border-s bg-muted/20 p-4 sm:block overflow-y-auto">
            <StepSidebar current={step} />
          </div>

          {/* Scrollable form area */}
          <div className="flex-1 overflow-y-auto">
            <form noValidate onSubmit={handleSubmit(onSubmit)}>
              <div className="px-6 py-5 space-y-4">
                {submitError && <Alert variant="error">{submitError}</Alert>}

                {/* Mobile progress bar */}
                <div className="flex items-center gap-1.5 sm:hidden">
                  {STEPS.map((s) => (
                    <div
                      key={s.num}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        s.num < step ? 'bg-emerald-400' : s.num === step ? 'bg-gold-500' : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>

                {/* ══════════════════════════════════════════════════
                    STEP 1 — اطلاعات پایه
                ══════════════════════════════════════════════════ */}
                {step === 1 && (
                  <>
                    <SectionHeader
                      icon={User}
                      title="اطلاعات هویتی"
                      desc="اطلاعات فردی و نوع مشتری را وارد کنید"
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        label="نام"
                        required
                        error={errors.firstName?.message}
                        {...register('firstName', {
                          required: 'نام الزامی است',
                          minLength: { value: 2, message: 'نام باید حداقل ۲ حرف باشد' },
                        })}
                      />
                      <Input
                        label="نام خانوادگی"
                        required
                        error={errors.lastName?.message}
                        {...register('lastName', {
                          required: 'نام خانوادگی الزامی است',
                          minLength: { value: 2, message: 'نام خانوادگی باید حداقل ۲ حرف باشد' },
                        })}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <NationalIdInput
                        label="کد ملی"
                        required
                        error={errors.nationalId?.message}
                        value={watch('nationalId')}
                        onValueChange={(v) => setValue('nationalId', v, { shouldValidate: true })}
                      />
                      <MobileInput
                        label="شماره موبایل"
                        required
                        error={errors.mobile?.message}
                        value={watch('mobile')}
                        onValueChange={(v) => setValue('mobile', v, { shouldValidate: true })}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        label="ایمیل"
                        dir="ltr"
                        type="email"
                        hint="اختیاری"
                        error={errors.email?.message}
                        value={watch('email')}
                        onChange={(e) => setValue('email', e.target.value, { shouldValidate: false })}
                        onBlur={() => void trigger('email')}
                      />
                      <DatePickerJalali
                        label="تاریخ تولد"
                        hint="اختیاری"
                        error={errors.dateOfBirth?.message}
                        value={watch('dateOfBirth')}
                        onChange={(v) => setValue('dateOfBirth', v, { shouldValidate: true })}
                      />
                    </div>

                    <GenderPicker
                      label="جنسیت"
                      hint="اختیاری"
                      value={watch('gender')}
                      onChange={(v) => setValue('gender', v, { shouldValidate: true })}
                      error={errors.gender?.message}
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField
                        label="نوع مشتری"
                        required
                        error={errors.type?.message}
                        {...register('type', { required: 'نوع مشتری الزامی است' })}
                      >
                        <option value="">انتخاب کنید...</option>
                        <option value="HOUSEHOLD">🏠 خانگی</option>
                        <option value="VIP">⭐ VIP</option>
                        <option value="PARTNER">🤝 همکار</option>
                        <option value="WHOLESALE">📦 عمده‌فروش</option>
                        <option value="CORPORATE">🏢 شرکت</option>
                      </SelectField>

                      <SelectField
                        label="وضعیت مشتری"
                        required
                        error={errors.initialAccountStatus?.message}
                        {...register('initialAccountStatus', { required: 'وضعیت مشتری الزامی است' })}
                      >
                        <option value="ACTIVE">● فعال</option>
                        <option value="INACTIVE">○ غیرفعال</option>
                      </SelectField>
                    </div>

                    <SelectField label="سطح مشتری" hint="اختیاری" {...register('level')}>
                      <option value="NORMAL">عادی</option>
                      <option value="VIP">VIP</option>
                      <option value="PREMIUM">ویژه</option>
                    </SelectField>

                    {isCorporate && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Building2 className="h-4 w-4 text-amber-700" />
                          <p className="text-sm font-semibold text-amber-800">اطلاعات شرکت</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            label="نام شرکت"
                            required
                            error={errors.companyName?.message}
                            {...register('companyName', {
                              validate: (v) => !isCorporate || v.trim().length >= 2 || 'نام شرکت الزامی است',
                            })}
                          />
                          <Input
                            label="شناسه ملی شرکت"
                            dir="ltr"
                            inputMode="numeric"
                            placeholder="10 رقم"
                            error={errors.companyNationalId?.message}
                            {...register('companyNationalId', {
                              validate: (v) => !v.trim() || /^\d{10,15}$/.test(v.trim()) || 'شناسه ملی معتبر نیست',
                            })}
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            label="شماره اقتصادی"
                            dir="ltr"
                            inputMode="numeric"
                            hint="اختیاری"
                            {...register('companyEconomicId')}
                          />
                          <Input
                            label="نام مسئول"
                            required
                            error={errors.contactName?.message}
                            {...register('contactName', {
                              validate: (v) => !isCorporate || v.trim().length >= 2 || 'نام مسئول الزامی است',
                            })}
                          />
                        </div>
                        <Input label="سمت مسئول" hint="اختیاری" {...register('contactTitle')} />
                      </div>
                    )}

                    <PasswordInput
                      label="رمز ورود به پورتال"
                      autoComplete="new-password"
                      hint="حداقل ۸ کاراکتر — مشتری با همین رمز وارد پورتال می‌شود"
                      required
                      error={errors.password?.message}
                      {...register('password', {
                        required: 'رمز عبور الزامی است',
                        minLength: { value: 8, message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' },
                      })}
                    />
                  </>
                )}

                {/* ══════════════════════════════════════════════════
                    STEP 2 — اطلاعات تماس
                ══════════════════════════════════════════════════ */}
                {step === 2 && (
                  <>
                    {/* ── Card 1: اطلاعات اصلی تماس ──────────────────── */}
                    <CardSection
                      icon={PhoneCall}
                      title="اطلاعات اصلی تماس"
                      desc="راه‌های ارتباطی اصلی مشتری"
                    >
                      <div className="grid gap-3 sm:grid-cols-3">
                        {/* شماره موبایل */}
                        <MobileInputWithIcon
                          label="شماره موبایل"
                          required
                          error={errors.mobile?.message}
                          value={watch('mobile')}
                          onValueChange={(v) => setValue('mobile', v, { shouldValidate: true })}
                        />

                        {/* ایمیل */}
                        <InputWithIcon
                          icon={Mail}
                          label="ایمیل"
                          type="email"
                          dir="ltr"
                          hint="اختیاری"
                          error={errors.email?.message}
                          value={watch('email')}
                          onChange={(e) => setValue('email', e.target.value, { shouldValidate: false })}
                          onBlur={() => void trigger('email')}
                        />

                        {/* تلفن ثابت */}
                        <InputWithIcon
                          icon={Phone}
                          label={isCorporate ? 'تلفن مسئول' : 'تلفن ثابت'}
                          dir="ltr"
                          inputMode="numeric"
                          hint="اختیاری"
                          error={errors.phone?.message}
                          value={watch('phone') ? toPersianDigits(latinPhone(watch('phone'))) : ''}
                          onChange={(e) =>
                            setValue('phone', latinPhone(e.target.value), {
                              shouldValidate: true,
                              shouldDirty: true,
                            })
                          }
                          onBlur={() => trigger('phone')}
                        />
                      </div>
                    </CardSection>

                    {/* ── Card 2: آدرس محل سکونت ──────────────────────── */}
                    <CardSection
                      icon={MapPin}
                      title={isCorporate ? 'آدرس شرکت' : 'آدرس محل سکونت'}
                      desc={isCorporate ? 'آدرس دقیق محل شرکت' : 'آدرس دقیق محل سکونت مشتری'}
                    >
                      {/* Row 1: Province / City / PostalCode — 3 columns */}
                      <div className="grid gap-3 sm:grid-cols-3">
                        {/* استان */}
                        <SearchableSelect
                          label="استان"
                          required
                          error={errors.province?.message}
                          options={provinceNames.map((n) => ({ value: n, label: n }))}
                          value={watchedProvince}
                          onChange={(v) => {
                            setValue('province', v, { shouldValidate: true });
                          }}
                          placeholder="انتخاب استان..."
                          searchPlaceholder="جستجوی استان..."
                        />

                        {/* شهر */}
                        <SearchableSelect
                          label="شهر"
                          required
                          error={errors.city?.message}
                          disabled={!watchedProvince}
                          options={cityOptions.map((n) => ({ value: n, label: n }))}
                          value={watch('city')}
                          onChange={(v) => setValue('city', v, { shouldValidate: true })}
                          placeholder={watchedProvince ? 'انتخاب شهر...' : 'ابتدا استان را انتخاب کنید'}
                          searchPlaceholder="جستجوی شهر..."
                        />

                        {/* کد پستی */}
                        <PostalCodeInput
                          label="کد پستی"
                          required
                          hint="۱۰ رقم وارد کنید"
                          error={errors.postalCode?.message}
                          value={watch('postalCode')}
                          onValueChange={(v) =>
                            setValue('postalCode', v, { shouldValidate: true, shouldDirty: true })
                          }
                          onBlur={() => trigger('postalCode')}
                        />
                      </div>

                      {/* Row 2: آدرس کامل */}
                      <TextareaField
                        label="آدرس کامل"
                        id="address"
                        required
                        rows={4}
                        maxLength={500}
                        placeholder="استان، شهر، خیابان، کوچه، پلاک، واحد ..."
                        error={errors.address?.message}
                        value={watchedAddress}
                        onChange={(e) => setValue('address', e.target.value, { shouldValidate: true })}
                      />
                    </CardSection>

                    {/* ── Card 3: اطلاعات ارتباطی تکمیلی ─────────────── */}
                    <CardSection
                      icon={Contact2}
                      title="اطلاعات ارتباطی تکمیلی"
                      desc="سایر راه‌های ارتباطی (اختیاری)"
                    >
                      {/* Row 1: Secondary mobile / Work phone / Fax — 3 columns */}
                      <div className="grid gap-3 sm:grid-cols-3">
                        {/* شماره موبایل دوم */}
                        <MobileInputWithIcon
                          label={isCorporate ? 'موبایل مسئول دوم' : 'شماره موبایل دوم'}
                          hint="اختیاری"
                          error={errors.secondaryMobile?.message}
                          value={watch('secondaryMobile')}
                          onValueChange={(v) => setValue('secondaryMobile', v, { shouldValidate: true })}
                        />

                        {/* تلفن محل کار */}
                        <InputWithIcon
                          icon={Phone}
                          label={isCorporate ? 'تلفن شرکت' : 'تلفن محل کار'}
                          dir="ltr"
                          inputMode="numeric"
                          hint="اختیاری"
                          error={errors.workPhone?.message}
                          value={watch('workPhone') ? toPersianDigits(latinPhone(watch('workPhone'))) : ''}
                          onChange={(e) =>
                            setValue('workPhone', latinPhone(e.target.value), {
                              shouldValidate: true,
                              shouldDirty: true,
                            })
                          }
                          onBlur={() => trigger('workPhone')}
                        />

                        {/* فکس */}
                        <InputWithIcon
                          icon={Phone}
                          label="فکس"
                          dir="ltr"
                          inputMode="numeric"
                          hint="اختیاری"
                          error={errors.fax?.message}
                          value={watch('fax') ? toPersianDigits(latinPhone(watch('fax'))) : ''}
                          onChange={(e) =>
                            setValue('fax', latinPhone(e.target.value), {
                              shouldValidate: true,
                              shouldDirty: true,
                            })
                          }
                          onBlur={() => trigger('fax')}
                        />
                      </div>

                      {/* آدرس محل کار */}
                      <TextareaField
                        label={isCorporate ? 'آدرس دفتر مرکزی' : 'آدرس محل کار'}
                        id="workAddress"
                        rows={3}
                        maxLength={500}
                        hint="اختیاری"
                        value={watchedWorkAddress}
                        onChange={(e) => setValue('workAddress', e.target.value)}
                      />

                      {/* توضیحات تماس */}
                      <TextareaField
                        label="توضیحات تماس"
                        id="contactNotes"
                        rows={3}
                        maxLength={500}
                        hint="اختیاری"
                        placeholder="ترجیحاً در ساعات اداری تماس گرفته شود."
                        value={watchedContactNotes}
                        onChange={(e) => setValue('contactNotes', e.target.value)}
                      />
                    </CardSection>
                  </>
                )}

                {/* ══════════════════════════════════════════════════
                    STEP 3 — اطلاعات تکمیلی
                ══════════════════════════════════════════════════ */}
                {step === 3 && (
                  <>
                    <SectionHeader
                      icon={FileText}
                      title="اطلاعات تکمیلی"
                      desc="اطلاعات احراز هویت، منبع آشنایی و یادداشت داخلی"
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField
                        label="وضعیت احراز هویت"
                        hint="اختیاری"
                        {...register('verificationStatus')}
                      >
                        <option value="">انتخاب نشده</option>
                        <option value="UNVERIFIED">تأیید نشده</option>
                        <option value="PENDING_REVIEW">در انتظار بررسی</option>
                        <option value="VERIFIED">تأیید شده</option>
                        <option value="REJECTED">رد شده</option>
                      </SelectField>

                      <SelectField
                        label="چگونه با ما آشنا شدید؟"
                        hint="اختیاری"
                        {...register('referenceSource')}
                      >
                        <option value="">انتخاب کنید...</option>
                        <option value="FRIEND_REFERRAL">معرفی دوستان</option>
                        <option value="INTERNET_SEARCH">جستجوی اینترنتی</option>
                        <option value="SOCIAL_MEDIA">شبکه‌های اجتماعی</option>
                        <option value="IN_PERSON">مراجعه حضوری</option>
                        <option value="ADVERTISEMENT">تبلیغات</option>
                        <option value="OTHER">سایر</option>
                      </SelectField>
                    </div>

                    <TextareaField
                      label="توضیحات / یادداشت داخلی"
                      id="internalNote"
                      rows={4}
                      maxLength={1000}
                      hint="⚠️ این یادداشت تنها برای کارکنان داخلی نمایش داده می‌شود و مشتری آن را نمی‌بیند."
                      value={watchedInternalNote}
                      onChange={(e) => setValue('internalNote', e.target.value)}
                    />
                  </>
                )}
              </div>

              {/* ── Footer ── */}
              <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-white px-6 py-4">
                {/* Left cluster */}
                <div className="flex gap-2">
                  {/* انصراف */}
                  <Button type="button" variant="outline" onClick={close} disabled={isLoading}>
                    <svg className="h-4 w-4 me-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                    انصراف
                  </Button>

                  {/* بازگشت (step 2 and 3 only) */}
                  {step > 1 && (
                    <Button type="button" variant="outline" onClick={goPrev} disabled={isLoading}>
                      بازگشت
                      <svg className="h-4 w-4 ms-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </Button>
                  )}
                </div>

                {/* Right cluster */}
                {step < 3 ? (
                  <Button type="button" onClick={() => void goNext()} disabled={isLoading}>
                    {step === 2 ? 'ذخیره و ادامه' : 'بعدی'}
                    <svg className="h-4 w-4 ms-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </Button>
                ) : (
                  <Button type="submit" isLoading={isLoading}>
                    <svg className="h-4 w-4 me-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    ذخیره مشتری
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      </Modal>
    </>
  );
}
