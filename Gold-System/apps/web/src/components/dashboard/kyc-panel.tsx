'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { KycImageEditor } from '@/components/portal/kyc/kyc-image-editor';
import { ConfirmDialog } from './confirm-dialog';
import { ApiErrorState } from './states';
import { PermissionGate } from './permission-gate';
import { internalKycApi, type KycDocumentRecord } from '@/lib/internal-api';
import { ApiClientError } from '@/lib/api';
import { kycDocumentLabel, requiredKycDocumentTypes } from '@/lib/kyc-documents';
import { PERSONAL_PHOTO_TYPE } from '@/lib/kyc-portrait-matte';
import { KYC_STATUS_LABELS, formatDateTime, statusLabel } from '@/lib/utils';

const CHECKERBOARD =
  'bg-[length:16px_16px] bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)] bg-[position:0_0,0_8px,8px_-8px,-8px_0]';

const MAX_KYC_IMAGE_BYTES = 10 * 1024 * 1024;

export function KycDocumentList({
  customerId,
  customerType,
  onDecision,
}: {
  customerId: string;
  customerType?: string | null;
  onDecision?: () => void;
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
  const extra = (data ?? []).filter(
    (doc) =>
      doc.documentType !== 'selfie_with_id' &&
      doc.documentType !== 'proof_of_address' &&
      !required.some((item) => item.value === doc.documentType),
  );
  const submittedCount = required.filter((item) => latestByType.has(item.value)).length;

  const run = async (reason?: string) => {
    if (!action) return;
    if (action.decision === 'REJECT' && (!reason || reason.trim().length < 10)) {
      setActionError('برای رد مدرک باید دلیل رد را وارد کنید.');
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      await internalKycApi.decideDocument(
        customerId,
        action.documentId,
        action.decision,
        action.decision === 'REJECT' ? reason?.trim() : undefined,
      );
      const remainingUnapproved = required.filter((item) => {
        const current = latestByType.get(item.value);
        if (!current) return true;
        if (action.decision === 'APPROVE' && current.id === action.documentId) return false;
        return current.verificationStatus !== 'APPROVED';
      });
      setMessage(
        action.decision === 'APPROVE' && remainingUnapproved.length === 0
          ? 'همه مدارک تأیید شد و مشتری احراز هویت‌شده است.'
          : action.decision === 'APPROVE'
            ? `${action.label} تأیید شد.`
            : `${action.label} رد شد.`,
      );
      setAction(null);
      await mutate();
      onDecision?.();
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {required.map((item) => (
          <DocumentCard
            key={item.value}
            customerId={customerId}
            label={item.label}
            required
            document={latestByType.get(item.value)}
            onChanged={() => void mutate()}
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
            onChanged={() => void mutate()}
            onDecide={(decision) =>
              setAction({ documentId: doc.id, decision, label: kycDocumentLabel(doc.documentType) })
            }
          />
        ))}
      </div>
      <ConfirmDialog
        open={action !== null}
        title={action?.decision === 'REJECT' ? `رد ${action.label}` : `تأیید ${action?.label ?? 'مدرک'}`}
        message={
          action?.decision === 'REJECT'
            ? 'قبل از رد مدرک باید دلیل را بنویسید. این دلیل برای مشتری نمایش داده می‌شود.'
            : 'این تصمیم روی همین مدرک ثبت می‌شود.'
        }
        destructive={action?.decision === 'REJECT'}
        requireReason={action?.decision === 'REJECT'}
        reasonLabel="دلیل رد مدرک"
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
  onChanged,
}: {
  customerId: string;
  label: string;
  document?: KycDocumentRecord;
  required?: boolean;
  onDecide: (decision: 'APPROVE' | 'REJECT') => void;
  onChanged: () => void;
}) {
  const approved = document?.verificationStatus === 'APPROVED';
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
          <DocumentPreview customerId={customerId} document={document} label={label} onChanged={onChanged} />
          {document.fileName ? <p className="text-xs text-muted-foreground">{document.fileName}</p> : null}
          {approved ? (
            <p className="text-xs font-medium text-emerald-700">این مدرک قبلاً تأیید شده است.</p>
          ) : null}
          {document.verificationStatus === 'REJECTED' && document.rejectionReason ? (
            <p className="text-xs text-red-600">دلیل رد: {document.rejectionReason}</p>
          ) : null}
          <PermissionGate anyOf="kyc.review">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={approved}
                title={approved ? 'این مدرک قبلاً تأیید شده است.' : undefined}
                onClick={() => onDecide('APPROVE')}
              >
                {approved ? 'تأیید شده' : 'تأیید مدرک'}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onDecide('REJECT')}>
                رد مدرک
              </Button>
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
  onChanged,
}: {
  customerId: string;
  document: KycDocumentRecord;
  label: string;
  onChanged: () => void;
}) {
  const isPersonalPhoto = document.documentType === PERSONAL_PHOTO_TYPE;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showProcessed, setShowProcessed] = useState(Boolean(document.hasProcessedFile));
  const mime = document.fileMimeType ?? '';
  const isImage = mime.startsWith('image/');
  const previewProcessed = isPersonalPhoto && showProcessed && Boolean(document.hasProcessedFile) && !showOriginal;

  useEffect(() => {
    setShowProcessed(Boolean(document.hasProcessedFile));
  }, [document.hasProcessedFile]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    internalKycApi
      .getDocumentFile(customerId, document.id, {
        original: showOriginal,
        processed: previewProcessed,
      })
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
  }, [
    customerId,
    document.id,
    document.fileSizeBytes,
    document.updatedAt,
    document.hasProcessedFile,
    showOriginal,
    previewProcessed,
  ]);

  const preview = failed ? (
    document.signedUrl ? (
      <a href={document.signedUrl} target="_blank" rel="noreferrer" className="text-sm text-gold-700 underline">
        مشاهده مدرک
      </a>
    ) : (
      <p className="text-sm text-muted-foreground">پیش‌نمایش مدرک در دسترس نیست.</p>
    )
  ) : !url ? (
    <p className="text-sm text-muted-foreground">در حال بارگذاری مدرک…</p>
  ) : mime === 'application/pdf' ? (
    <iframe title={label} src={url} className="h-48 w-full rounded-md border bg-muted" />
  ) : (
    <img
      src={url}
      alt={label}
      className={`max-h-48 w-full rounded-md border object-contain ${previewProcessed ? CHECKERBOARD : 'bg-muted'}`}
    />
  );

  return (
    <div className="space-y-2">
      {preview}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="text-sm text-gold-700 underline">
            مشاهده در اندازه کامل
          </a>
        ) : null}
        {document.hasOriginalFile ? (
          <button
            type="button"
            className="text-sm text-gold-700 underline"
            onClick={() => {
              setShowOriginal((current) => !current);
              setShowProcessed(false);
            }}
          >
            {showOriginal ? 'نمایش نسخه ویرایش‌شده' : 'نمایش فایل اصلی'}
          </button>
        ) : null}
        {document.hasProcessedFile ? (
          <button
            type="button"
            className="text-sm text-gold-700 underline"
            onClick={() => {
              setShowOriginal(false);
              setShowProcessed((current) => !current);
            }}
          >
            {previewProcessed ? 'نمایش نسخه بررسی' : 'نمایش عکس بدون پس‌زمینه'}
          </button>
        ) : null}
      </div>
      {isImage ? (
        <PermissionGate anyOf="kyc.review">
          <StaffImageEditor customerId={customerId} document={document} onSaved={onChanged} />
        </PermissionGate>
      ) : null}
    </div>
  );
}

function StaffImageEditor({
  customerId,
  document,
  onSaved,
}: {
  customerId: string;
  document: KycDocumentRecord;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const blob = await internalKycApi.getDocumentFile(customerId, document.id);
      const name = document.fileName?.replace(/\.[^.]+$/, '') || 'document';
      setSource(new File([blob], `${name}.jpg`, { type: blob.type || 'image/jpeg' }));
      setOpen(true);
    } catch {
      setError('بارگذاری تصویر برای ویرایش انجام نشد.');
    } finally {
      setLoading(false);
    }
  };

  const save = async (file: File) => {
    setSaving(true);
    setError(null);
    try {
      const personalCutout = document.documentType === PERSONAL_PHOTO_TYPE && file.type === 'image/png';
      if (personalCutout) {
        await internalKycApi.saveProcessedPersonalPhoto(customerId, document.id, file);
        setMessage('عکس بدون پس‌زمینه ذخیره شد. نسخه اصلی برای بررسی باقی ماند.');
      } else {
        await internalKycApi.replaceDocumentImage(customerId, document.id, file);
        setMessage('تصویر ویرایش‌شده ذخیره شد. نسخه اصلی برای بازرسی نگه داشته شده است.');
      }
      setOpen(false);
      setSource(null);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'ذخیره تصویر ویرایش‌شده انجام نشد.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" isLoading={loading} disabled={saving} onClick={() => void start()}>
        ویرایش تصویر
      </Button>
      {message ? <Alert variant="success">{message}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Modal
        open={open && source !== null}
        onClose={() => {
          if (saving) return;
          setOpen(false);
          setSource(null);
        }}
        title="ویرایش تصویر مدرک"
        className="max-w-lg"
      >
        {source ? (
          <KycImageEditor
            file={source}
            maxBytes={MAX_KYC_IMAGE_BYTES}
            skipLabel="انصراف"
            applyLabel={saving ? 'در حال ذخیره…' : 'ذخیره تصویر ویرایش‌شده'}
            allowBackgroundRemoval={document.documentType === PERSONAL_PHOTO_TYPE}
            onUseOriginal={() => {
              setOpen(false);
              setSource(null);
            }}
            onApply={(file) => void save(file)}
            onError={setError}
          />
        ) : null}
      </Modal>
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
