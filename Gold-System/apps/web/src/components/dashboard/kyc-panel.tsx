'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { KycImageEditor } from '@/components/portal/kyc/kyc-image-editor';
import { ConfirmDialog } from './confirm-dialog';
import { ApiErrorState } from './states';
import { PermissionGate } from './permission-gate';
import {
  internalKycApi,
  type KycDocumentRecord,
  type KycHistoryRecord,
} from '@/lib/internal-api';
import { ApiClientError } from '@/lib/api';
import { kycDocumentLabel, requiredKycDocumentTypes } from '@/lib/kyc-documents';
import { PERSONAL_PHOTO_TYPE } from '@/lib/kyc-portrait-matte';
import {
  KYC_STATUS_LABELS,
  cn,
  formatDateTime,
  formatFaNumber,
  statusLabel,
} from '@/lib/utils';

const CHECKERBOARD =
  'bg-[length:16px_16px] bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)] bg-[position:0_0,0_8px,8px_-8px,-8px_0]';

const MAX_KYC_IMAGE_BYTES = 10 * 1024 * 1024;

export type KycDocumentStats = {
  approved: number;
  rejected: number;
  pending: number;
  requiredTotal: number;
  submittedCount: number;
  allRequiredPresent: boolean;
  allRequiredApproved: boolean;
  anyRequiredRejected: boolean;
};

export function computeKycDocumentStats(
  documents: KycDocumentRecord[] | undefined,
  customerType?: string | null,
): KycDocumentStats {
  const required = requiredKycDocumentTypes(customerType);
  const latestByType = new Map<string, KycDocumentRecord>();
  for (const doc of [...(documents ?? [])].reverse()) {
    latestByType.set(doc.documentType, doc);
  }

  let approved = 0;
  let rejected = 0;
  let pending = 0;

  for (const item of required) {
    const doc = latestByType.get(item.value);
    if (!doc) {
      pending += 1;
      continue;
    }
    if (doc.verificationStatus === 'APPROVED') approved += 1;
    else if (doc.verificationStatus === 'REJECTED') rejected += 1;
    else pending += 1;
  }

  for (const doc of documents ?? []) {
    if (required.some((item) => item.value === doc.documentType)) continue;
    if (doc.documentType === 'selfie_with_id' || doc.documentType === 'proof_of_address') continue;
    const latest = latestByType.get(doc.documentType);
    if (latest?.id !== doc.id) continue;
    if (doc.verificationStatus === 'APPROVED') approved += 1;
    else if (doc.verificationStatus === 'REJECTED') rejected += 1;
    else pending += 1;
  }

  const requiredStatuses = required.map((item) => latestByType.get(item.value)?.verificationStatus);
  const allRequiredPresent = required.length > 0 && requiredStatuses.every((s) => s != null);
  const allRequiredApproved =
    required.length > 0 && requiredStatuses.every((s) => s === 'APPROVED');
  const anyRequiredRejected = requiredStatuses.some((s) => s === 'REJECTED');
  const submittedCount = required.filter((item) => latestByType.has(item.value)).length;

  return {
    approved,
    rejected,
    pending,
    requiredTotal: required.length,
    submittedCount,
    allRequiredPresent,
    allRequiredApproved,
    anyRequiredRejected,
  };
}

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
      setMessage(
        action.decision === 'APPROVE' ? `${action.label} تأیید شد.` : `${action.label} رد شد.`,
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
        {formatFaNumber(submittedCount)} از {formatFaNumber(required.length)} مدرک الزامی ارسال شده
        است.
        {customerType === 'PARTNER' ? ' برای مشتری همکار، جواز کسب هم الزامی است.' : ''}
      </p>
      {message ? <Alert variant="success">{message}</Alert> : null}
      {actionError ? <Alert variant="error">{actionError}</Alert> : null}
      <div className="grid min-w-0 auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {required.map((item) => (
          <DocumentCard
            key={item.value}
            customerId={customerId}
            label={item.label}
            required
            document={latestByType.get(item.value)}
            onChanged={() => void mutate()}
            onDecide={(decision) =>
              setAction({
                documentId: latestByType.get(item.value)!.id,
                decision,
                label: item.label,
              })
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
              setAction({
                documentId: doc.id,
                decision,
                label: kycDocumentLabel(doc.documentType),
              })
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

function documentCardChrome(status?: string) {
  if (status === 'APPROVED') return 'border-emerald-200 bg-emerald-50/40';
  if (status === 'REJECTED') return 'border-rose-200 bg-rose-50/40';
  if (!status) return 'border-dashed border-slate-200 bg-slate-50/60';
  return 'border-slate-200 bg-white';
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
  const rejected = document?.verificationStatus === 'REJECTED';

  return (
    <article
      className={cn(
        'flex h-full min-w-0 flex-col gap-3 rounded-xl border p-4 shadow-sm',
        documentCardChrome(document?.verificationStatus),
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h4 className="font-semibold text-slate-900">{label}</h4>
          <p className="text-xs text-muted-foreground">{required ? 'الزامی' : 'اضافی'}</p>
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
          <DocumentPreview
            customerId={customerId}
            document={document}
            label={label}
            onChanged={onChanged}
          />
          <div className="space-y-1 text-xs text-muted-foreground">
            {document.fileName ? (
              <p className="truncate" title={document.fileName} dir="ltr">
                {document.fileName}
              </p>
            ) : null}
            <p>تاریخ ارسال: {formatDateTime(document.createdAt)}</p>
          </div>
          {rejected && document.rejectionReason ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              دلیل رد: {document.rejectionReason}
            </div>
          ) : null}
          <div className="mt-auto space-y-2 pt-1">
            <PermissionGate anyOf="kyc.review">
              <div className="flex flex-wrap gap-2">
                {approved ? (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled
                    title="این مدرک قبلاً تأیید شده است."
                  >
                    تأیید شده
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => onDecide('APPROVE')}>
                    تأیید مدرک
                  </Button>
                )}
                <Button size="sm" variant="destructive" onClick={() => onDecide('REJECT')}>
                  رد مدرک
                </Button>
              </div>
            </PermissionGate>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white/70 px-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">این مدرک هنوز ارسال نشده است.</p>
        </div>
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
  const previewProcessed =
    isPersonalPhoto && showProcessed && Boolean(document.hasProcessedFile) && !showOriginal;

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

  const previewFrame = 'flex h-60 w-full items-center justify-center overflow-hidden rounded-lg border bg-muted';

  const preview = failed ? (
    document.signedUrl ? (
      <div className={previewFrame}>
        <a
          href={document.signedUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-gold-700 underline"
        >
          مشاهده مدرک
        </a>
      </div>
    ) : (
      <div className={previewFrame}>
        <p className="text-sm text-muted-foreground">پیش‌نمایش مدرک در دسترس نیست.</p>
      </div>
    )
  ) : !url ? (
    <div className={previewFrame}>
      <p className="text-sm text-muted-foreground">در حال بارگذاری مدرک…</p>
    </div>
  ) : mime === 'application/pdf' ? (
    <iframe title={label} src={url} className="h-60 w-full rounded-lg border bg-muted" />
  ) : (
    <div className={cn(previewFrame, previewProcessed ? CHECKERBOARD : 'bg-slate-100')}>
      <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
    </div>
  );

  return (
    <div className="space-y-2">
      {preview}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {url || document.signedUrl ? (
            <Button size="sm" variant="outline" asChild>
              <a href={url ?? document.signedUrl} target="_blank" rel="noreferrer">
                مشاهده تصویر کامل
              </a>
            </Button>
          ) : null}
          {isImage ? (
            <PermissionGate anyOf="kyc.review">
              <StaffImageEditor customerId={customerId} document={document} onSaved={onChanged} />
            </PermissionGate>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {document.hasOriginalFile ? (
          <button
            type="button"
            className="text-xs text-gold-700 underline"
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
            className="text-xs text-gold-700 underline"
            onClick={() => {
              setShowOriginal(false);
              setShowProcessed((current) => !current);
            }}
          >
            {previewProcessed ? 'نمایش نسخه بررسی' : 'نمایش عکس بدون پس‌زمینه'}
          </button>
        ) : null}
      </div>
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
    <div className="contents">
      <Button size="sm" variant="outline" isLoading={loading} disabled={saving} onClick={() => void start()}>
        ویرایش تصویر
      </Button>
      {message ? (
        <div className="basis-full">
          <Alert variant="success">{message}</Alert>
        </div>
      ) : null}
      {error ? (
        <div className="basis-full">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}
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

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
      )}
      <span className={done ? 'text-slate-700' : 'text-muted-foreground'}>{label}</span>
    </li>
  );
}

export function KycDecisionPanel({
  customerId,
  customerType,
  reviewStatus,
  onDone,
}: {
  customerId: string;
  customerType?: string | null;
  reviewStatus?: string | null;
  onDone?: () => void;
}) {
  const { data: documents } = useSWR(['kyc-docs', customerId], () =>
    internalKycApi.getDocuments(customerId, true),
  );
  const stats = useMemo(
    () => computeKycDocumentStats(documents, customerType),
    [documents, customerType],
  );

  const [action, setAction] = useState<'APPROVE' | 'REJECT' | 'REVIEW' | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const known = reviewStatus != null && reviewStatus !== '';
  const open = reviewStatus === 'UNDER_REVIEW' || reviewStatus === 'PENDING';
  const showStart = !known || !open;
  const showDecide = !known || open;
  const canFinalApprove = stats.allRequiredApproved;
  const caseApproved = reviewStatus === 'APPROVED';
  const caseRejected = reviewStatus === 'REJECTED';

  const incompleteHints: string[] = [];
  if (!stats.allRequiredPresent) {
    incompleteHints.push(
      `${formatFaNumber(stats.requiredTotal - stats.submittedCount)} مدرک الزامی هنوز ارسال نشده است.`,
    );
  }
  if (stats.anyRequiredRejected) {
    incompleteHints.push('حداقل یک مدرک الزامی رد شده است.');
  }
  if (stats.allRequiredPresent && !stats.allRequiredApproved && !stats.anyRequiredRejected) {
    incompleteHints.push('همه مدارک الزامی هنوز بررسی و تأیید نشده‌اند.');
  }

  const run = async (reason?: string) => {
    if (!action) return;
    if (action === 'APPROVE' && !canFinalApprove) {
      setError('تأیید نهایی فقط پس از تأیید همه مدارک الزامی ممکن است.');
      setAction(null);
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (action === 'REVIEW') await internalKycApi.startReview(customerId);
      else await internalKycApi.decide(customerId, action, reason);
      setMessage(
        action === 'APPROVE'
          ? 'احراز هویت تأیید شد.'
          : action === 'REJECT'
            ? 'احراز هویت رد شد.'
            : 'بررسی آغاز شد.',
      );
      setAction(null);
      setRejectReason('');
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'عملیات انجام نشد.');
    } finally {
      setPending(false);
    }
  };

  const caseStatusLabel = known
    ? statusLabel(KYC_STATUS_LABELS, reviewStatus!)
    : 'هنوز بررسی شروع نشده';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>تصمیم احراز هویت</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              تأیید یا رد، نتیجه کل پرونده است و با تأیید تک‌تک مدارک متفاوت است.
            </p>
          </div>
          {known ? (
            <StatusBadge status={reviewStatus!} label={caseStatusLabel} />
          ) : (
            <StatusBadge status="PENDING" label={caseStatusLabel} />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? <Alert variant="success">{message}</Alert> : null}
        {error ? <Alert variant="error">{error}</Alert> : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-4">
            <p className="mb-3 text-sm font-semibold text-sky-900">قبل از تصمیم نهایی</p>
            <ul className="space-y-2">
              <ChecklistItem
                done={stats.allRequiredPresent}
                label="همه مدارک الزامی ارسال شده‌اند"
              />
              <ChecklistItem
                done={!stats.anyRequiredRejected && stats.allRequiredPresent}
                label="هیچ مدرک الزامی رد‌شده‌ای باقی نمانده"
              />
              <ChecklistItem
                done={stats.allRequiredApproved}
                label="همه مدارک الزامی تأیید شده‌اند"
              />
            </ul>
            {!canFinalApprove && incompleteHints.length > 0 ? (
              <p className="mt-3 text-xs text-amber-800">{incompleteHints.join(' ')}</p>
            ) : (
              <p className="mt-3 text-xs text-emerald-700">
                شرایط لازم برای تأیید نهایی پرونده فراهم است.
              </p>
            )}
          </div>

          <PermissionGate anyOf="kyc.review">
            <div className="flex flex-col gap-3">
              {showStart ? (
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setAction('REVIEW')}>
                  شروع بررسی
                </Button>
              ) : null}
              {showDecide ? (
                <>
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 sm:w-auto"
                    disabled={!canFinalApprove || caseApproved}
                    title={
                      !canFinalApprove
                        ? 'تأیید نهایی فقط پس از تأیید همه مدارک الزامی ممکن است.'
                        : caseApproved
                          ? 'این پرونده قبلاً تأیید شده است.'
                          : undefined
                    }
                    onClick={() => setAction('APPROVE')}
                  >
                    تأیید احراز هویت
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full border-rose-300 text-rose-700 hover:bg-rose-50 sm:w-auto"
                    disabled={caseRejected}
                    onClick={() => setAction('REJECT')}
                  >
                    رد درخواست
                  </Button>
                  <div>
                    <label htmlFor={`kyc-reject-reason-${customerId}`} className="mb-1 block text-sm font-medium">
                      دلیل رد درخواست
                    </label>
                    <textarea
                      id={`kyc-reject-reason-${customerId}`}
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="در صورت رد، دلیل را وارد کنید…"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatFaNumber(rejectReason.length)}/{formatFaNumber(500)}
                    </p>
                  </div>
                </>
              ) : null}
            </div>
          </PermissionGate>
        </div>

        <ConfirmDialog
          open={action !== null}
          title={
            action === 'REJECT'
              ? 'رد احراز هویت'
              : action === 'APPROVE'
                ? 'تأیید احراز هویت'
                : 'شروع بررسی'
          }
          message="این عمل ثبت می‌شود و فقط از مسیر مجاز سرور انجام می‌گیرد."
          destructive={action === 'REJECT'}
          requireReason={action === 'REJECT'}
          minReason={10}
          initialReason={action === 'REJECT' ? rejectReason : ''}
          isLoading={pending}
          onClose={() => setAction(null)}
          onConfirm={(reason) => void run(reason)}
        />
      </CardContent>
    </Card>
  );
}

export function KycHistoryTable({
  items,
}: {
  items: KycHistoryRecord[];
}) {
  const showReviewer = items.some((item) => item.reviewerId);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">سابقه‌ای ثبت نشده است.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[32rem] table-auto text-sm">
        <thead className="bg-slate-50 text-muted-foreground">
          <tr className="border-b text-right">
            <th className="px-3 py-2 font-medium">تاریخ و زمان</th>
            {showReviewer ? <th className="px-3 py-2 font-medium">بررسی‌کننده</th> : null}
            <th className="px-3 py-2 font-medium">نتیجه</th>
            <th className="px-3 py-2 font-medium">دلیل</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item) => (
            <tr key={item.id} className="bg-white">
              <td className="whitespace-nowrap px-3 py-2.5">
                {formatDateTime(item.reviewedAt ?? item.createdAt)}
              </td>
              {showReviewer ? (
                <td className="px-3 py-2.5 font-mono text-xs" dir="ltr">
                  {item.reviewerId ?? '—'}
                </td>
              ) : null}
              <td className="px-3 py-2.5">
                <StatusBadge
                  status={item.status}
                  label={statusLabel(KYC_STATUS_LABELS, item.status)}
                />
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {item.decisionReason?.trim() ? item.decisionReason : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KycReviewHeaderStats({ stats }: { stats: KycDocumentStats }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <span className="inline-flex items-center gap-1.5 text-emerald-700">
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        تأیید شده: {formatFaNumber(stats.approved)}
      </span>
      <span className="inline-flex items-center gap-1.5 text-rose-700">
        <XCircle className="h-4 w-4" aria-hidden />
        رد شده: {formatFaNumber(stats.rejected)}
      </span>
      <span className="inline-flex items-center gap-1.5 text-sky-700">
        <Clock className="h-4 w-4" aria-hidden />
        در حال بررسی: {formatFaNumber(stats.pending)}
      </span>
    </div>
  );
}
