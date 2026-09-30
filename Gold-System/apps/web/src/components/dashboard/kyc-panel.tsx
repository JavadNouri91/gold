'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from './confirm-dialog';
import { ApiErrorState } from './states';
import { PermissionGate } from './permission-gate';
import { internalKycApi, type KycDocumentRecord } from '@/lib/internal-api';
import { ApiClientError } from '@/lib/api';
import { kycDocumentLabel, requiredKycDocumentTypes } from '@/lib/kyc-documents';
import { KYC_STATUS_LABELS, formatDateTime, statusLabel } from '@/lib/utils';

export function KycDocumentList({
  customerId,
  customerType,
}: {
  customerId: string;
  customerType?: string | null;
}) {
  const { data, error, isLoading, mutate } = useSWR(
    ['kyc-docs', customerId],
    () => internalKycApi.getDocuments(customerId, true),
  );
  const [action, setAction] = useState<{
    documentId: string;
    decision: 'APPROVE' | 'REJECT';
    label: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const required = requiredKycDocumentTypes(customerType);
  const latestByType = new Map<string, KycDocumentRecord>();
  for (const doc of [...(data ?? [])].reverse()) {
    latestByType.set(doc.documentType, doc);
  }
  const extra = (data ?? []).filter((doc) => !required.some((item) => item.value === doc.documentType));
  const submittedCount = required.filter((item) => latestByType.has(item.value)).length;

  const run = async (reason?: string) => {
    if (!action) return;
    setPending(true);
    setActionError(null);
    try {
      await internalKycApi.decideDocument(customerId, action.documentId, action.decision, reason);
      setMessage(action.decision === 'APPROVE' ? `${action.label} تأیید شد.` : `${action.label} رد شد.`);
      setAction(null);
      await mutate();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'تصمیم مدرک ثبت نشد.');
    } finally {
      setPending(false);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">در حال دریافت مدارک…</p>;
  if (error) return <ApiErrorState error={error} onRetry={() => void mutate()} />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {submittedCount.toLocaleString('fa-IR')} از {required.length.toLocaleString('fa-IR')} مدرک الزامی ارسال شده است.
        {customerType === 'PARTNER' ? ' برای مشتری همکار، جواز کسب هم الزامی است.' : ''}
      </p>
      {message ? <Alert variant="success">{message}</Alert> : null}
      {actionError ? <Alert variant="error">{actionError}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {required.map((item) => (
          <DocumentCard
            key={item.value}
            customerId={customerId}
            label={item.label}
            required
            document={latestByType.get(item.value)}
            onDecide={(decision) =>
              setAction({ documentId: latestByType.get(item.value)!.id, decision, label: item.label })
            }
          />
        ))}
        {extra.map((doc) => (
          <DocumentCard
            key={doc.id}
            customerId={customerId}
            label={kycDocumentLabel(doc.documentType)}
            document={doc}
            onDecide={(decision) =>
              setAction({ documentId: doc.id, decision, label: kycDocumentLabel(doc.documentType) })
            }
          />
        ))}
      </div>
      <ConfirmDialog
        open={action !== null}
        title={action?.decision === 'REJECT' ? `رد ${action.label}` : `تأیید ${action?.label ?? 'مدرک'}`}
        message="این تصمیم روی همین مدرک ثبت می‌شود."
        destructive={action?.decision === 'REJECT'}
        requireReason={action?.decision === 'REJECT'}
        minReason={10}
        isLoading={pending}
        onClose={() => setAction(null)}
        onConfirm={(reason) => void run(reason)}
      />
    </div>
  );
}

function DocumentCard({
  customerId,
  label,
  document,
  required = false,
  onDecide,
}: {
  customerId: string;
  label: string;
  document?: KycDocumentRecord;
  required?: boolean;
  onDecide: (decision: 'APPROVE' | 'REJECT') => void;
}) {
  return (
    <article className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-medium">{label}</h4>
          <p className="text-xs text-muted-foreground">
            {required ? 'الزامی' : 'اضافی'}
            {document ? ` — ${formatDateTime(document.createdAt)}` : ''}
          </p>
        </div>
        {document ? (
          <StatusBadge
            status={document.verificationStatus}
            label={statusLabel(KYC_STATUS_LABELS, document.verificationStatus)}
          />
        ) : (
          <StatusBadge status="PENDING" label="ارسال نشده" />
        )}
      </div>
      {document ? (
        <>
          <DocumentPreview customerId={customerId} document={document} label={label} />
          {document.fileName ? <p className="text-xs text-muted-foreground">{document.fileName}</p> : null}
          {document.verificationStatus === 'REJECTED' && document.rejectionReason ? (
            <p className="text-xs text-red-600">دلیل رد: {document.rejectionReason}</p>
          ) : null}
          <PermissionGate anyOf="kyc.review">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onDecide('APPROVE')}>تأیید مدرک</Button>
              <Button size="sm" variant="destructive" onClick={() => onDecide('REJECT')}>رد مدرک</Button>
            </div>
          </PermissionGate>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">این مدرک هنوز ارسال نشده است.</p>
      )}
    </article>
  );
}

function DocumentPreview({
  customerId,
  document,
  label,
}: {
  customerId: string;
  document: KycDocumentRecord;
  label: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    internalKycApi
      .getDocumentFile(customerId, document.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [customerId, document.id]);

  if (failed) {
    return document.signedUrl ? (
      <a href={document.signedUrl} target="_blank" rel="noreferrer" className="text-sm text-gold-700 underline">
        مشاهده مدرک
      </a>
    ) : (
      <p className="text-sm text-muted-foreground">پیش‌نمایش مدرک در دسترس نیست.</p>
    );
  }
  if (!url) return <p className="text-sm text-muted-foreground">در حال بارگذاری مدرک…</p>;

  const mime = document.fileMimeType ?? '';
  return (
    <div className="space-y-2">
      {mime === 'application/pdf' ? (
        <iframe title={label} src={url} className="h-72 w-full rounded-md border bg-muted" />
      ) : (
        <img src={url} alt={label} className="max-h-72 w-full rounded-md border bg-muted object-contain" />
      )}
      <a href={url} target="_blank" rel="noreferrer" className="text-sm text-gold-700 underline">
        مشاهده در اندازه کامل
      </a>
    </div>
  );
}

export function KycDecisionPanel({
  customerId,
  reviewStatus,
  onDone,
}: {
  customerId: string;
  reviewStatus?: string | null;
  onDone?: () => void;
}) {
  const [action, setAction] = useState<'APPROVE' | 'REJECT' | 'REVIEW' | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const known = reviewStatus != null && reviewStatus !== '';
  const open = reviewStatus === 'UNDER_REVIEW' || reviewStatus === 'PENDING';
  const showStart = !known || !open;
  const showDecide = !known || open;

  const run = async (reason?: string) => {
    if (!action) return;
    setPending(true);
    setError(null);
    try {
      if (action === 'REVIEW') await internalKycApi.startReview(customerId);
      else await internalKycApi.decide(customerId, action, reason);
      setMessage(action === 'APPROVE' ? 'احراز هویت تأیید شد.' : action === 'REJECT' ? 'احراز هویت رد شد.' : 'بررسی آغاز شد.');
      setAction(null);
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'عملیات انجام نشد.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>تصمیم احراز هویت</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {message ? <Alert variant="success">{message}</Alert> : null}
        {error ? <Alert variant="error">{error}</Alert> : null}
        <p className="text-xs text-muted-foreground">
          تأیید یا رد، نتیجه کل پرونده است. رد کردن پرونده نیاز به دلیل دارد.
        </p>
        <PermissionGate anyOf="kyc.review">
          <div className="flex flex-wrap gap-2">
            {showStart ? <Button variant="outline" onClick={() => setAction('REVIEW')}>شروع بررسی</Button> : null}
            {showDecide ? <Button onClick={() => setAction('APPROVE')}>تأیید</Button> : null}
            {showDecide ? <Button variant="destructive" onClick={() => setAction('REJECT')}>رد</Button> : null}
          </div>
        </PermissionGate>
        <ConfirmDialog
          open={action !== null}
          title={action === 'REJECT' ? 'رد احراز هویت' : action === 'APPROVE' ? 'تأیید احراز هویت' : 'شروع بررسی'}
          message="این عمل ثبت می‌شود و فقط از مسیر مجاز سرور انجام می‌گیرد."
          destructive={action === 'REJECT'}
          requireReason={action === 'REJECT'}
          minReason={10}
          isLoading={pending}
          onClose={() => setAction(null)}
          onConfirm={(reason) => void run(reason)}
        />
      </CardContent>
    </Card>
  );
}
