'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { internalCustomersApi, internalKycApi } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { ForbiddenNotice, PermissionGate } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import {
  KycDecisionPanel,
  KycDocumentList,
  KycHistoryTable,
  KycReviewHeaderStats,
  computeKycDocumentStats,
} from '@/components/dashboard/kyc-panel';
import { StatusBadge } from '@/components/portal/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PERSONAL_PHOTO_TYPE } from '@/lib/kyc-portrait-matte';
import {
  CUSTOMER_STATUS_LABELS,
  KYC_STATUS_LABELS,
  cn,
  formatDate,
  formatFaNumber,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';

function CustomerAvatar({
  customerId,
  fullName,
  canLoadPhoto,
}: {
  customerId: string;
  fullName: string;
  canLoadPhoto: boolean;
}) {
  const docs = useSWR(canLoadPhoto ? ['kyc-docs', customerId] : null, () =>
    internalKycApi.getDocuments(customerId, true),
  );
  const photo = useMemo(() => {
    const list = docs.data ?? [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i]?.documentType === PERSONAL_PHOTO_TYPE) return list[i];
    }
    return null;
  }, [docs.data]);

  const [url, setUrl] = useState<string | null>(null);
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

  useEffect(() => {
    if (!photo) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    internalKycApi
      .getDocumentFile(customerId, photo.id, {
        processed: Boolean(photo.hasProcessedFile),
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [customerId, photo?.id, photo?.hasProcessedFile, photo?.updatedAt]);

  return (
    <div
      className={cn(
        'flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-gold-50 text-lg font-bold text-gold-800',
      )}
      aria-hidden={!url}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span>{initials || '؟'}</span>
      )}
    </div>
  );
}

function caseStatusCopy(status?: string | null) {
  if (status === 'APPROVED') {
    return {
      title: 'احراز هویت تأیید شده',
      hint: 'پرونده مشتری تأیید نهایی شده است.',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    };
  }
  if (status === 'REJECTED') {
    return {
      title: 'درخواست رد شده',
      hint: 'پرونده احراز هویت رد شده است.',
      tone: 'border-rose-200 bg-rose-50 text-rose-900',
    };
  }
  if (status === 'UNDER_REVIEW' || status === 'PENDING') {
    return {
      title: 'در انتظار تصمیم نهایی',
      hint: 'وضعیت کل پرونده از وضعیت تک‌تک مدارک جدا است.',
      tone: 'border-amber-200 bg-amber-50 text-amber-900',
    };
  }
  return {
    title: 'بررسی شروع نشده',
    hint: 'برای ثبت تصمیم نهایی ابتدا بررسی را آغاز کنید.',
    tone: 'border-slate-200 bg-slate-50 text-slate-800',
  };
}

export default function KycDetailPage({ params }: { params: { customerId: string } }) {
  const { user } = useAuth();
  const canReview = hasPermission(user?.permissions, 'kyc.review');
  const canDocs = hasPermission(user?.permissions, 'kyc.documents.read');
  const customer = useSWR(
    hasPermission(user?.permissions, 'customer.read') ? ['kyc-customer', params.customerId] : null,
    () => internalCustomersApi.getById(params.customerId),
  );
  const history = useSWR(canReview ? ['kyc-history', params.customerId] : null, () =>
    internalKycApi.history(params.customerId),
  );
  const docs = useSWR(canDocs ? ['kyc-docs', params.customerId] : null, () =>
    internalKycApi.getDocuments(params.customerId, true),
  );

  const stats = useMemo(
    () => computeKycDocumentStats(docs.data, customer.data?.type),
    [docs.data, customer.data?.type],
  );
  const latestCaseStatus = history.data?.[0]?.status ?? customer.data?.verificationStatus ?? null;
  const caseCopy = caseStatusCopy(latestCaseStatus);

  const refresh = () => {
    void history.mutate();
    void customer.mutate();
    void docs.mutate();
  };

  if (!canReview && !canDocs) return <ForbiddenNotice permission="kyc.review" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="بررسی احراز هویت"
        description={
          customer.data
            ? `${customer.data.fullName} — ${toPersianDigits(customer.data.customerNumber)}`
            : 'پرونده مشتری'
        }
      />
      {customer.error ? <ApiErrorState error={customer.error} /> : null}

      {customer.data ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardContent className="flex items-center gap-4 p-5">
              <CustomerAvatar
                customerId={params.customerId}
                fullName={customer.data.fullName}
                canLoadPhoto={canDocs}
              />
              <div className="min-w-0 space-y-1">
                <p className="truncate text-base font-bold text-slate-900">
                  {customer.data.fullName}
                </p>
                <p className="text-sm text-muted-foreground">
                  شناسه مشتری:{' '}
                  <span className="tabular-nums" dir="ltr">
                    {toPersianDigits(customer.data.customerNumber)}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  تاریخ ثبت‌نام: {formatDate(customer.data.createdAt)}
                </p>
                <p className="text-xs">
                  وضعیت حساب:{' '}
                  <Link
                    className="text-gold-800 underline-offset-2 hover:underline"
                    href={`/dashboard/customers/${customer.data.id}`}
                  >
                    {statusLabel(CUSTOMER_STATUS_LABELS, customer.data.status)}
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={cn('lg:col-span-1', caseCopy.tone)}>
            <CardContent className="flex h-full items-center gap-3 p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/80">
                <Clock className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium opacity-80">وضعیت کل پرونده</p>
                <p className="font-bold">{caseCopy.title}</p>
                <p className="text-xs opacity-80">{caseCopy.hint}</p>
                {latestCaseStatus ? (
                  <StatusBadge
                    status={latestCaseStatus}
                    label={statusLabel(KYC_STATUS_LABELS, latestCaseStatus)}
                  />
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardContent className="flex h-full flex-col justify-center gap-3 p-5">
              <p className="text-sm font-semibold text-slate-800">خلاصه وضعیت مدارک</p>
              {canDocs ? (
                <KycReviewHeaderStats stats={stats} />
              ) : (
                <p className="text-sm text-muted-foreground">مجوز مشاهده مدرک ندارید.</p>
              )}
              <p className="text-xs text-muted-foreground">
                {formatFaNumber(stats.submittedCount)} از {formatFaNumber(stats.requiredTotal)} مدرک
                الزامی ارسال شده
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>مدارک شناسایی</CardTitle>
        </CardHeader>
        <CardContent>
          <PermissionGate
            anyOf="kyc.documents.read"
            fallback={<p className="text-sm">مجوز مشاهده مدرک ندارید.</p>}
          >
            <KycDocumentList
              customerId={params.customerId}
              customerType={customer.data?.type}
              onDecision={refresh}
            />
          </PermissionGate>
        </CardContent>
      </Card>

      {canReview ? (
        <KycDecisionPanel
          customerId={params.customerId}
          customerType={customer.data?.type}
          reviewStatus={history.data?.[0]?.status}
          onDone={refresh}
        />
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>سوابق بررسی</CardTitle>
        </CardHeader>
        <CardContent>
          {!canReview ? (
            <p className="text-sm text-muted-foreground">
              سابقه بررسی نیاز به مجوز بررسی احراز دارد.
            </p>
          ) : null}
          {history.error ? <ApiErrorState error={history.error} /> : null}
          {canReview ? <KycHistoryTable items={history.data ?? []} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
