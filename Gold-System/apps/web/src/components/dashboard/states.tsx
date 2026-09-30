'use client';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiClientError } from '@/lib/api';

export function ApiErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const forbidden = error instanceof ApiClientError && error.isForbidden;
  const message = forbidden
    ? 'دسترسی به این بخش برای شما مجاز نیست. مجوز در سمت سرور بررسی می‌شود.'
    : error instanceof ApiClientError
      ? error.message
      : 'خطا در دریافت اطلاعات. لطفاً دوباره تلاش کنید.';

  return (
    <Alert variant="error" title={forbidden ? 'عدم دسترسی' : 'خطا'}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{message}</span>
        {onRetry && !forbidden ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            تلاش مجدد
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}

export function SkeletonBlock({ className = 'h-24' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted ${className}`} />;
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="در حال بارگذاری">
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonBlock key={index} className="h-10" />
      ))}
    </div>
  );
}
