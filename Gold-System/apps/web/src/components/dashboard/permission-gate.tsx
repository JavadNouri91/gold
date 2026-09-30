'use client';

import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';

interface PermissionGateProps {
  anyOf: string | readonly string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Hides controls the current user is not permitted to use.
 * This is presentation only. The API still rejects unauthorized calls.
 */
export function PermissionGate({ anyOf, children, fallback = null }: PermissionGateProps) {
  const { user } = useAuth();
  if (!hasPermission(user?.permissions, anyOf)) return <>{fallback}</>;
  return <>{children}</>;
}

export function ForbiddenNotice({ permission }: { permission: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
      مشاهده این صفحه نیاز به مجوز <span dir="ltr">{permission}</span> دارد.
      پنهان کردن منو امنیت ایجاد نمی‌کند؛ سرور درخواست غیرمجاز را رد می‌کند.
    </div>
  );
}
