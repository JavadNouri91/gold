'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pencil, UserRound } from 'lucide-react';
import { customerApi, type CustomerProfile } from '@/lib/api';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileNumber } from '@/components/ui/mobile-input';
import { Modal } from '@/components/ui/modal';
import { PostalCodeInput } from '@/components/ui/postal-code-input';
import {
  CUSTOMER_STATUS_LABELS,
  cn,
  customerTypeBadgeLabel,
  formatDate,
  formatNationalId,
  formatPostalCode,
  isValidEmail,
  latinPostalCode,
} from '@/lib/utils';
import { friendlyApiMessage } from './friendly-message';

const IDENTITY_NOTICE = 'برای تغییر اطلاعات هویتی، لطفاً با پشتیبانی تماس بگیرید.';

type FieldView = {
  label: string;
  value: ReactNode;
  ltr?: boolean;
  valueClassName?: string;
};

export function PersonalInformationCard({
  customer,
  onSaved,
}: {
  customer: CustomerProfile;
  onSaved: () => Promise<unknown> | unknown;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const accountStatus = customer.accountStatus ?? customer.status;
  const accountActive = accountStatus === 'ACTIVE' || accountStatus === 'APPROVED';
  const accountLabel = CUSTOMER_STATUS_LABELS[accountStatus] ?? accountStatus;
  const postal = formatPostalCode(customer.postalCode);

  const fields: FieldView[] = [
    { label: 'نام', value: customer.firstName },
    { label: 'نام خانوادگی', value: customer.lastName },
    {
      label: 'شماره موبایل',
      value: <MobileNumber value={customer.mobile} />,
    },
    { label: 'ایمیل', value: customer.email?.trim() || '—', ltr: true },
    { label: 'کد ملی', value: formatNationalId(customer.nationalId) || '—', ltr: true },
    { label: 'تاریخ تولد', value: formatDate(customer.dateOfBirth) || '—' },
    { label: 'آدرس', value: customer.address?.trim() || '—' },
    { label: 'کد پستی', value: postal && postal !== '—' ? postal : '—', ltr: true },
    { label: 'نوع کاربر', value: customerTypeBadgeLabel(customer.type) ?? '—' },
    { label: 'تاریخ عضویت', value: formatDate(customer.createdAt) || '—' },
    {
      label: 'وضعیت حساب',
      value: accountLabel,
      valueClassName: accountActive ? 'text-emerald-600' : undefined,
    },
  ];

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <UserRound className="h-5 w-5 text-amber-600" aria-hidden />
          اطلاعات شخصی
        </h2>
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-amber-600 transition-colors hover:text-amber-700"
        >
          <Pencil className="h-4 w-4" aria-hidden />
          ویرایش اطلاعات
        </button>
      </div>

      <div className="mt-4 border-t border-gray-100" />

      {saved ? (
        <Alert variant="success" className="mt-4">
          اطلاعات تماس ذخیره شد.
        </Alert>
      ) : null}

      <dl className="mt-4">
        {Array.from({ length: Math.ceil(fields.length / 2) }, (_, index) =>
          fields.slice(index * 2, index * 2 + 2),
        ).map((row) => (
          <div
            key={row.map((field) => field.label).join('-')}
            className="grid grid-cols-1 gap-x-12 border-slate-100 md:grid-cols-2 md:border-b md:py-4 md:last:border-b-0"
          >
            {row.map((field) => (
              <div
                key={field.label}
                className="min-w-0 border-b border-slate-100 py-4 md:border-b-0 md:py-0"
              >
                <dt className="text-sm text-slate-500">{field.label}</dt>
                <dd
                  className={cn(
                    'mt-1.5 break-words text-base font-bold text-slate-900',
                    field.valueClassName,
                  )}
                  dir={field.ltr ? 'ltr' : undefined}
                >
                  {field.value || '—'}
                </dd>
              </div>
            ))}
          </div>
        ))}
      </dl>

      <EditContactModal
        open={open}
        customer={customer}
        onClose={() => setOpen(false)}
        onSaved={async () => {
          await onSaved();
          setSaved(true);
          setOpen(false);
        }}
      />
    </section>
  );
}

function EditContactModal({
  open,
  customer,
  onClose,
  onSaved,
}: {
  open: boolean;
  customer: CustomerProfile;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [email, setEmail] = useState(customer.email ?? '');
  const [address, setAddress] = useState(customer.address ?? '');
  const [postalCode, setPostalCode] = useState(customer.postalCode ?? '');
  const [emailError, setEmailError] = useState<string>();
  const [postalError, setPostalError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setEmail(customer.email ?? '');
      setAddress(customer.address ?? '');
      setPostalCode(customer.postalCode ?? '');
      setEmailError(undefined);
      setPostalError(undefined);
      setFormError(undefined);
    }
    wasOpen.current = open;
  }, [open, customer]);

  const reset = () => {
    setEmail(customer.email ?? '');
    setAddress(customer.address ?? '');
    setPostalCode(customer.postalCode ?? '');
    setEmailError(undefined);
    setPostalError(undefined);
    setFormError(undefined);
  };

  const submit = async () => {
    const nextEmail = email.trim();
    const nextPostal = latinPostalCode(postalCode);
    if (nextEmail && !isValidEmail(nextEmail)) {
      setEmailError('ایمیل معتبر نیست');
      return;
    }
    if (nextPostal && nextPostal.length !== 10) {
      setPostalError('کد پستی باید ۱۰ رقم باشد');
      return;
    }
    setEmailError(undefined);
    setPostalError(undefined);
    setFormError(undefined);
    setSaving(true);
    try {
      await customerApi.updateMe({
        email: nextEmail,
        address: address.trim(),
        postalCode: nextPostal,
      });
      await onSaved();
    } catch (err) {
      setFormError(friendlyApiMessage(err, 'ذخیره اطلاعات انجام نشد. لطفاً دوباره تلاش کنید.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="ویرایش اطلاعات تماس"
      className="max-w-lg"
    >
      <Alert variant="info">{IDENTITY_NOTICE}</Alert>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        نام، نام خانوادگی، کد ملی، شماره موبایل و تاریخ تولد از این صفحه قابل تغییر نیستند.
      </p>
      <div className="mt-4 space-y-3">
        <Input
          label="ایمیل"
          type="email"
          dir="ltr"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={emailError}
          autoComplete="email"
        />
        <div className="space-y-1">
          <label htmlFor="profile-address" className="block text-sm font-medium">
            آدرس
          </label>
          <textarea
            id="profile-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            rows={3}
            maxLength={500}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
          />
        </div>
        <PostalCodeInput
          label="کد پستی"
          value={postalCode}
          onValueChange={setPostalCode}
          error={postalError}
        />
      </div>
      {formError ? (
        <Alert variant="error" className="mt-4">
          {formError}
        </Alert>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            reset();
            onClose();
          }}
          disabled={saving}
        >
          انصراف
        </Button>
        <Button type="button" onClick={() => void submit()} isLoading={saving}>
          ذخیره
        </Button>
      </div>
    </Modal>
  );
}
