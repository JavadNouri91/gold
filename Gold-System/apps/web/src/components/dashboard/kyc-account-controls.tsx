'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ShieldCheck, UserCog } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { internalCustomersApi, internalKycApi, type StaffCustomer } from '@/lib/internal-api';
import { ApiClientError } from '@/lib/api';
import { CUSTOMER_STATUS_LABELS, CUSTOMER_TYPE_LABELS, cn, statusLabel } from '@/lib/utils';
import { PermissionGate } from './permission-gate';

const TYPE_OPTIONS = ['HOUSEHOLD', 'PARTNER', 'VIP'] as const;

/** Statuses in which the server allows assigning a customer type. */
function typeAssignable(status: string): boolean {
  return status === 'APPROVED' || status === 'ACTIVE';
}

/** Blocked/suspended accounts must go through the account-status screen. */
function activationBlocked(status: string): boolean {
  return status === 'SUSPENDED' || status === 'BLOCKED';
}

export function KycAccountControls({
  customerId,
  customer,
  documentsApproved,
  onChanged,
}: {
  customerId: string;
  customer: StaffCustomer;
  /** True only when every required KYC document is approved. */
  documentsApproved: boolean;
  onChanged?: () => void;
}) {
  const [type, setType] = useState(customer.type ?? '');
  const [assigning, setAssigning] = useState(false);
  const [activating, setActivating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setType(customer.type ?? '');
  }, [customer.type]);

  const isActive = customer.status === 'ACTIVE';
  const blocked = activationBlocked(customer.status);
  const canActivate = documentsApproved && !isActive && !blocked;
  const canAssign = typeAssignable(customer.status);

  const assignGroup = async () => {
    if (!type) {
      setError('ابتدا گروه مشتری را انتخاب کنید.');
      return;
    }
    setAssigning(true);
    setError(null);
    setMessage(null);
    try {
      await internalCustomersApi.assignType(customerId, type, 'تعیین گروه مشتری از پرونده احراز هویت');
      setMessage('گروه مشتری ثبت شد.');
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'ثبت گروه مشتری انجام نشد.');
    } finally {
      setAssigning(false);
    }
  };

  const activate = async () => {
    setActivating(true);
    setError(null);
    setMessage(null);
    try {
      await internalKycApi.activate(customerId);
      setMessage('حساب مشتری فعال شد.');
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'فعال‌سازی حساب انجام نشد.');
    } finally {
      setActivating(false);
    }
  };

  return (
    <section className="space-y-4" aria-label="مدیریت حساب مشتری">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-slate-50 px-3 py-1 font-medium text-slate-700">
          <UserCog className="h-3.5 w-3.5" aria-hidden />
          وضعیت: {statusLabel(CUSTOMER_STATUS_LABELS, customer.status)}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium',
            documentsApproved
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-800',
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          {documentsApproved ? 'همه مدارک تأیید شده' : 'مدارک تأیید نشده'}
        </span>
        {isActive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            حساب فعال است
          </span>
        ) : null}
      </div>

      {message ? <Alert variant="success">{message}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}

      <PermissionGate
        anyOf="kyc.review"
        fallback={
          <p className="text-sm text-muted-foreground">
            فعال‌سازی حساب نیاز به مجوز بررسی احراز هویت دارد.
          </p>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            isLoading={activating}
            disabled={!canActivate}
            onClick={() => void activate()}
            title={
              canActivate
                ? 'حساب مشتری را فعال کنید'
                : !documentsApproved
                  ? 'پس از تأیید همه مدارک الزامی، فعال‌سازی ممکن است'
                  : undefined
            }
          >
            فعال‌سازی حساب مشتری
          </Button>
          <p className="text-xs text-muted-foreground">
            {isActive
              ? 'این مشتری فعال است و می‌تواند سفارش ثبت کند.'
              : blocked
                ? 'حساب معلق یا مسدود را باید از صفحه مشتری مدیریت کنید.'
                : documentsApproved
                  ? 'همه مدارک تأیید شده است؛ حساب را فعال کنید.'
                  : 'تا زمانی که همه مدارک الزامی تأیید نشوند، فعال‌سازی حساب غیرفعال می‌ماند.'}
          </p>
        </div>
      </PermissionGate>

      <PermissionGate
        anyOf="customer.group.assign"
        fallback={
          <p className="text-sm text-muted-foreground">
            تعیین گروه مشتری نیاز به مجوز تخصیص گروه دارد.
          </p>
        }
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm" htmlFor="kyc-customer-group">
              گروه مشتری
              <select
                id="kyc-customer-group"
                className="mt-1 block h-10 w-44 rounded-md border px-3"
                value={type}
                disabled={!canAssign || assigning}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="">انتخاب کنید</option>
                {TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {CUSTOMER_TYPE_LABELS[option] ?? option}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              isLoading={assigning}
              disabled={!canAssign || !type || type === (customer.type ?? '')}
              onClick={() => void assignGroup()}
            >
              ثبت گروه
            </Button>
          </div>

          {customer.status === 'APPROVED' ? (
            <p className="text-xs text-muted-foreground">
              ثبت گروه برای مشتری تأییدشده، حساب را به‌صورت خودکار فعال می‌کند.
            </p>
          ) : null}
          {!canAssign ? (
            <p className="text-xs text-muted-foreground">
              تعیین گروه پس از تأیید احراز هویت (وضعیت «تأیید شده» یا «فعال») امکان‌پذیر است.
            </p>
          ) : null}
          {!customer.type && canAssign ? (
            <p className="text-xs text-amber-700">
              برای امکان ثبت سفارش، گروه مشتری را هم تعیین کنید.
            </p>
          ) : null}
        </div>
      </PermissionGate>
    </section>
  );
}
