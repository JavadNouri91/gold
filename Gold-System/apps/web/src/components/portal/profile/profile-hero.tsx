'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Check } from 'lucide-react';
import { customerApi, fetchBlob, type CustomerProfile, type KycPhase } from '@/lib/api';
import { kycSummaryBadge } from '@/components/portal/settings/kyc-summary';
import { Badge } from '@/components/ui/badge';
import { MobileNumber } from '@/components/ui/mobile-input';
import { Modal } from '@/components/ui/modal';
import {
  CUSTOMER_ACCOUNT_STATUS_LABELS,
  CUSTOMER_STATUS_LABELS,
  cn,
  toPersianDigits,
} from '@/lib/utils';
import { AvatarImageEditor } from './avatar-image-editor';
import { friendlyApiMessage } from './friendly-message';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function ProfileHero({
  customer,
  kycPhase,
  onUpdated,
}: {
  customer: CustomerProfile;
  kycPhase?: KycPhase;
  onUpdated: () => Promise<unknown> | unknown;
}) {
  const name = `${customer.firstName} ${customer.lastName}`.trim();
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountStatus = customer.accountStatus ?? customer.status;
  const accountActive = accountStatus === 'ACTIVE' || accountStatus === 'APPROVED';
  const accountLabel =
    CUSTOMER_ACCOUNT_STATUS_LABELS[accountStatus] ??
    CUSTOMER_STATUS_LABELS[accountStatus] ??
    accountStatus;
  const kycBadge = kycPhase
    ? kycPhase === 'VERIFIED'
      ? { label: 'احراز هویت: تکمیل‌شده', variant: 'green' as const }
      : {
          label: `احراز هویت: ${kycSummaryBadge(kycPhase).label}`,
          variant: kycSummaryBadge(kycPhase).variant,
          className: kycSummaryBadge(kycPhase).className,
        }
    : null;

  useEffect(() => {
    if (!customer.hasAvatar) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    fetchBlob('/customers/me/avatar')
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [customer.hasAvatar, customer.updatedAt]);

  const onFile = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('فقط تصویر JPG، PNG یا WebP پذیرفته می‌شود.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('حجم تصویر نباید بیشتر از ۲ مگابایت باشد.');
      return;
    }
    setError(null);
    setSelectedFile(file);
  };

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      await customerApi.uploadAvatar(file);
      await onUpdated();
      setSelectedFile(null);
    } catch (err) {
      const message = friendlyApiMessage(err, 'ذخیره عکس انجام نشد. لطفاً دوباره تلاش کنید.');
      setError(message);
      throw new Error(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-gold-100 bg-[#fbf7ef] shadow-sm">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 hidden w-56 items-center justify-center sm:flex"
          aria-hidden
        >
          <GoldMark />
        </div>
        <div className="relative flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative shrink-0">
              {src ? (
                <img
                  src={src}
                  alt=""
                  className="h-16 w-16 rounded-full border border-gold-200 object-cover shadow-sm md:h-20 md:w-20"
                />
              ) : (
                <AvatarInitials name={name} />
              )}
              <button
                type="button"
                className="absolute -bottom-1 -left-1 flex h-8 w-8 items-center justify-center rounded-full border border-gold-200 bg-white text-gold-800 shadow-sm hover:bg-gold-50 disabled:opacity-60"
                aria-label="تغییر عکس پروفایل"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                <Camera className="h-4 w-4" aria-hidden />
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label="انتخاب عکس پروفایل"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) onFile(file);
                }}
              />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold text-slate-900 md:text-2xl">{name}</h2>
              <p className="mt-2 text-sm text-slate-600">
                موبایل:{' '}
                <MobileNumber value={customer.mobile} className="font-medium text-slate-800" />
              </p>
              <p className="mt-1 text-sm text-slate-600">
                شماره مشتری:{' '}
                <span dir="ltr" className="font-medium text-slate-800">
                  {toPersianDigits(customer.customerNumber)}
                </span>
              </p>
              {uploading ? <p className="mt-2 text-xs text-muted-foreground">در حال ذخیره عکس…</p> : null}
              {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {kycBadge ? (
              <Badge
                variant={kycBadge.variant}
                className={cn(
                  'gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold',
                  kycPhase === 'VERIFIED' && 'bg-emerald-600 text-white',
                  'className' in kycBadge ? kycBadge.className : undefined,
                )}
              >
                {kycPhase === 'VERIFIED' ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                {kycBadge.label}
              </Badge>
            ) : null}
            <Badge
              variant={accountActive ? 'green' : 'gray'}
              className={cn(
                'gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold',
                accountActive && 'bg-emerald-600 text-white',
              )}
            >
              {accountActive ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
              وضعیت حساب: {accountLabel}
            </Badge>
          </div>
        </div>
      </section>

      <Modal
        open={Boolean(selectedFile)}
        onClose={() => {
          if (!uploading) setSelectedFile(null);
        }}
        title="تنظیم عکس پروفایل"
        className="max-h-[calc(100vh-2rem)] max-w-md overflow-y-auto p-4 sm:p-6"
      >
        {selectedFile ? (
          <AvatarImageEditor
            file={selectedFile}
            onCancel={() => setSelectedFile(null)}
            onApply={uploadAvatar}
          />
        ) : null}
      </Modal>
    </>
  );
}

function AvatarInitials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-gold-200 bg-white text-lg font-bold text-gold-800 shadow-sm md:h-20 md:w-20">
      {initials || '؟'}
    </div>
  );
}

function GoldMark() {
  return (
    <svg width="168" height="92" viewBox="0 0 168 92" className="opacity-80">
      <rect x="78" y="8" width="72" height="22" rx="4" fill="#f6d98a" />
      <rect x="48" y="32" width="96" height="22" rx="4" fill="#e8c15a" />
      <rect x="18" y="56" width="120" height="26" rx="4" fill="#d4a017" />
    </svg>
  );
}