'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { customerApi, fetchBlob, type CustomerProfile } from '@/lib/api';
import { UserStatusBadge } from '@/components/portal/user-status-badge';
import { formatDate } from '@/lib/utils';
import { friendlyApiMessage } from './friendly-message';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function ProfileHero({
  customer,
  onUpdated,
}: {
  customer: CustomerProfile;
  onUpdated: () => Promise<unknown> | unknown;
}) {
  const name = `${customer.firstName} ${customer.lastName}`.trim();
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const onFile = async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('فقط تصویر JPG، PNG یا WebP پذیرفته می‌شود.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('حجم تصویر نباید بیشتر از ۲ مگابایت باشد.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      await customerApi.uploadAvatar(file);
      await onUpdated();
    } catch (err) {
      setError(friendlyApiMessage(err, 'ذخیره عکس انجام نشد. لطفاً دوباره تلاش کنید.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-gold-100 bg-[#fbf7ef] shadow-sm">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 hidden w-56 items-center justify-center sm:flex"
        aria-hidden
      >
        <GoldMark />
      </div>
      <div className="relative flex items-center gap-4 p-5 md:p-6">
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
              if (file) void onFile(file);
            }}
          />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold text-slate-900 md:text-2xl">{name}</h2>
          <p className="mt-2 text-sm text-slate-600">
            شماره مشتری:{' '}
            <span dir="ltr" className="font-medium text-slate-800">
              {customer.customerNumber}
            </span>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            عضویت از:{' '}
            <span className="font-medium text-slate-800">{formatDate(customer.createdAt)}</span>
          </p>
          <div className="mt-3">
            <UserStatusBadge type={customer.type} status={customer.status} />
          </div>
          {uploading ? <p className="mt-2 text-xs text-muted-foreground">در حال ذخیره عکس…</p> : null}
          {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
        </div>
      </div>
    </section>
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
