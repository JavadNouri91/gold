'use client';

import { useEffect, useState } from 'react';
import { fetchBlob, type CustomerProfile } from '@/lib/api';
import { cn } from '@/lib/utils';

export function CustomerAvatar({
  customer,
  name,
  size = 'h-9 w-9',
  className,
}: {
  customer?: CustomerProfile | null;
  name: string;
  size?: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!customer?.hasAvatar) {
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
  }, [customer?.hasAvatar, customer?.updatedAt]);

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn(size, 'rounded-full object-cover ring-1 ring-[#D99A00]/40', className)}
      />
    );
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

  return (
    <span
      className={cn(
        size,
        'flex items-center justify-center rounded-full bg-[#FFF4D6] text-sm font-bold text-[#B77900] ring-1 ring-[#D99A00]/40',
        className,
      )}
    >
      {initials || '؟'}
    </span>
  );
}
