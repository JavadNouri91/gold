'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  Home,
  Lock,
  ShieldCheck,
  Store,
  UserRound,
  X,
} from 'lucide-react';
import { kycApi, type KycDocumentDisplayStatus, type KycPhase, type OwnKycDocument, type OwnKycOverview } from '@/lib/api';
import {
  DOCUMENT_STATUS_LABEL,
  documentGridClass,
  formatKycDateTime,
  heroCopy,
  kycSteps,
  primaryCta,
  reviewCopy,
  scrollToKycTarget,
  uploadErrorMessage,
} from '@/lib/kyc-present';
import { cn, toPersianDigits } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';
import { KycUploadDialog } from '@/components/portal/kyc/kyc-upload-dialog';

const HISTORY_PAGE = 8;

const PHASE_SHELL: Record<KycPhase, string> = {
  VERIFIED: 'border-green-100 bg-[#F0FDF4]',
  UNDER_REVIEW: 'border-green-100 bg-[#F3FBF4]',
  NEEDS_CORRECTION: 'border-amber-100 bg-[#FFFBEB]',
  REJECTED: 'border-red-100 bg-[#FEF2F2]',
  SUBMITTED: 'border-blue-100 bg-[#EFF6FF]',
  IN_PROGRESS: 'border-[#F3E2BC] bg-[#FFF4D6]',
  NOT_STARTED: 'border-[#E5E7EB] bg-white',
};

const PHASE_ICON: Record<KycPhase, string> = {
  VERIFIED: 'bg-[#16A34A] text-white',
  UNDER_REVIEW: 'bg-[#16A34A] text-white',
  NEEDS_CORRECTION: 'bg-[#F59E0B] text-white',
  REJECTED: 'bg-[#DC2626] text-white',
  SUBMITTED: 'bg-[#2563EB] text-white',
  IN_PROGRESS: 'bg-[#C8922E] text-white',
  NOT_STARTED: 'bg-[#F3F4F6] text-[#6B7280]',
};

const CARD_SHELL: Record<KycDocumentDisplayStatus, string> = {
  APPROVED: 'border-green-100 bg-[#F0FDF4]',
  UNDER_REVIEW: 'border-amber-100 bg-[#FFFBEB]',
  SUBMITTED: 'border-blue-100 bg-[#EFF6FF]',
  NOT_UPLOADED: 'border-red-100 bg-[#FEF2F2]',
  REJECTED: 'border-red-100 bg-[#FEF2F2]',
  NEEDS_CORRECTION: 'border-red-100 bg-[#FEF2F2]',
};

const BADGE: Record<KycDocumentDisplayStatus, string> = {
  APPROVED: 'bg-white text-[#16A34A]',
  UNDER_REVIEW: 'bg-white text-[#B45309]',
  SUBMITTED: 'bg-white text-[#2563EB]',
  NOT_UPLOADED: 'bg-white text-[#DC2626]',
  REJECTED: 'bg-white text-[#DC2626]',
  NEEDS_CORRECTION: 'bg-white text-[#DC2626]',
};

export function KycExperience({
  overview,
  onChanged,
}: {
  overview: OwnKycOverview;
  onChanged: () => Promise<unknown>;
}) {
  const [uploadType, setUploadType] = useState<string | null>(null);
  const [seedFile, setSeedFile] = useState<File | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OwnKycDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [historyCount, setHistoryCount] = useState(HISTORY_PAGE);
  const hero = heroCopy(overview);
  const review = reviewCopy(overview);
  const action = primaryCta(overview.phase);
  const steps = kycSteps(overview.phase, overview.identityComplete);
  const uploadTarget = overview.documents.find((item) => item.type === uploadType) ?? null;
  const viewTarget = overview.documents.find((item) => item.file?.id === viewId) ?? null;
  const history = overview.history.slice(0, historyCount);

  const send = async (file: File) => {
    if (!uploadTarget) return;
    setUploading(true);
    setUploadError(null);
    try {
      await kycApi.uploadDocument(uploadTarget.type, file);
      setUploadType(null);
      setSeedFile(null);
      await onChanged();
    } catch (error) {
      setUploadError(uploadErrorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const removeDocument = async () => {
    const fileId = deleteTarget?.file?.id;
    if (!fileId) return;
    setDeleting(true);
    setPrepareError(null);
    try {
      await kycApi.deleteOwnDocument(fileId);
      setDeleteTarget(null);
      await onChanged();
    } catch (error) {
      setPrepareError(uploadErrorMessage(error));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-4">
      <header className="hidden lg:block">
        <h2 className="text-xl font-bold text-[#202124]">احراز هویت (KYC)</h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-[#6B7280]">
          برای فعال‌سازی کامل امکانات معاملاتی، احراز هویت خود را تکمیل کنید.
        </p>
      </header>

      <section
        className={cn('rounded-2xl border p-4 shadow-sm sm:p-5', PHASE_SHELL[overview.phase])}
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
              PHASE_ICON[overview.phase],
            )}
            aria-hidden
          >
            <PhaseIcon phase={overview.phase} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#202124] sm:text-lg">{hero.title}</h2>
            <p className="mt-1 text-sm leading-6 text-[#374151]">{hero.body}</p>
            {overview.submittedAt ? (
              <p className="mt-3 text-xs text-[#6B7280]">
                تاریخ ارسال:{' '}
                <span className="font-semibold text-[#202124]">{formatKycDateTime(overview.submittedAt)}</span>
              </p>
            ) : null}
          </div>
        </div>
        {action ? (
          <button
            type="button"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#C8922E] px-5 text-sm font-semibold text-white hover:bg-[#b07f28] sm:w-auto"
            onClick={() => scrollToKycTarget(action.target)}
          >
            {action.label}
          </button>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm" aria-label="مراحل احراز هویت">
        <ol className="relative grid grid-cols-4 gap-1">
          <span aria-hidden className="pointer-events-none absolute start-[12.5%] end-[12.5%] top-4 h-0.5 bg-[#E5E7EB]" />
          {steps.map((step, index) => (
            <li key={step.label} className="relative z-[1] flex min-w-0 flex-col items-center text-center">
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold',
                  step.state === 'done' && 'border-[#16A34A] bg-[#16A34A] text-white',
                  step.state === 'current' && 'border-[#F59E0B] bg-[#F59E0B] text-white',
                  step.state === 'failed' && 'border-[#DC2626] bg-[#DC2626] text-white',
                  step.state === 'upcoming' && 'border-[#E5E7EB] bg-white text-[#6B7280]',
                )}
              >
                {step.state === 'done' ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : step.state === 'failed' ? (
                  <X className="h-4 w-4" aria-hidden />
                ) : (
                  toPersianDigits(String(index + 1))
                )}
              </span>
              <span className="mt-2 w-full break-words text-[11px] font-semibold leading-4 text-[#202124] sm:text-xs">
                {step.label}
              </span>
              <span className="mt-0.5 text-[10px] leading-4 text-[#6B7280]">{step.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="kyc-documents" className="scroll-mt-24">
        <h2 className="text-base font-bold text-[#202124]">مدارک موردنیاز</h2>
        <p className="mt-1 text-sm text-[#6B7280]">مدارک زیر را با کیفیت مناسب ارسال کنید.</p>
        {prepareError ? (
          <p role="alert" className="mt-2 text-sm font-medium text-[#DC2626]">
            {prepareError}
          </p>
        ) : null}
        <div className={cn('mt-3', documentGridClass(overview.documents.length))}>
          {overview.documents.map((document) => (
            <DocumentCard
              key={document.type}
              document={document}
              onUpload={() => {
                setPrepareError(null);
                setUploadError(null);
                setSeedFile(null);
                setUploadType(document.type);
              }}
              onEdit={() => {
                if (!document.file) return;
                setPrepareError(null);
                setUploadError(null);
                void kycApi
                  .getOwnDocumentFile(document.file.id)
                  .then((blob) => {
                    const next = new File([blob], document.file?.fileName || 'document.jpg', {
                      type: blob.type || document.file?.fileMimeType || 'image/jpeg',
                    });
                    setSeedFile(next);
                    setUploadType(document.type);
                  })
                  .catch(() => setPrepareError('پیش‌نمایش مدرک برای ویرایش در دسترس نیست.'));
              }}
              onView={() => document.file && setViewId(document.file.id)}
              onDelete={() => {
                setPrepareError(null);
                setDeleteTarget(document);
              }}
            />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section id="kyc-review" className="scroll-mt-24 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-[#F59E0B]" aria-hidden />
            <h2 className="text-base font-bold text-[#202124]">وضعیت بررسی</h2>
          </div>
          <p className="mt-3 text-sm font-semibold text-[#202124]">{review.title}</p>
          <p className="mt-1 text-sm leading-6 text-[#6B7280]">{review.body}</p>
        </section>
        <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold text-[#202124]">چرا احراز هویت لازم است؟</h2>
          <p className="mt-3 text-sm leading-7 text-[#6B7280]">
            احراز هویت برای حفظ امنیت حساب، جلوگیری از سوءاستفاده و فعال‌سازی امکانات معاملاتی انجام می‌شود.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[#202124]">
            <Lock className="h-4 w-4 text-[#C8922E]" aria-hidden />
            امنیت اطلاعات
          </p>
        </section>
      </div>

      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold text-[#202124]">تاریخچه احراز هویت</h2>
        {history.length === 0 ? (
          <p className="mt-4 text-sm text-[#6B7280]">هنوز سابقه‌ای ثبت نشده است.</p>
        ) : (
          <>
            <div className="mt-3 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[36rem] text-right text-sm">
                <thead>
                  <tr className="border-b border-[#E5E7EB] text-xs text-[#6B7280]">
                    <th className="px-2 py-2 font-medium">تاریخ و زمان</th>
                    <th className="px-2 py-2 font-medium">مرحله</th>
                    <th className="px-2 py-2 font-medium">وضعیت</th>
                    <th className="px-2 py-2 font-medium">توضیحات</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((event) => (
                    <tr key={event.id} className="border-b border-[#F3F4F6] last:border-0">
                      <td className="whitespace-nowrap px-2 py-3 text-[#202124]">{formatKycDateTime(event.occurredAt)}</td>
                      <td className="px-2 py-3 font-medium text-[#202124]">{event.title}</td>
                      <td className="px-2 py-3">
                        <HistoryStatus label={event.statusLabel} tone={event.tone} />
                      </td>
                      <td className="px-2 py-3 leading-6 text-[#6B7280]">{event.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ol className="mt-3 space-y-3 md:hidden">
              {history.map((event) => (
                <li key={event.id} className="rounded-xl border border-[#E5E7EB] p-3">
                  <p className="text-xs text-[#6B7280]">{formatKycDateTime(event.occurredAt)}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-[#202124]">{event.title}</p>
                    <HistoryStatus label={event.statusLabel} tone={event.tone} />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#6B7280]">{event.description}</p>
                </li>
              ))}
            </ol>
            {overview.history.length > history.length ? (
              <button
                type="button"
                className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#C8922E]"
                onClick={() => setHistoryCount((count) => count + HISTORY_PAGE)}
              >
                نمایش موارد بیشتر
              </button>
            ) : null}
          </>
        )}
      </section>

      {uploadTarget ? (
        <KycUploadDialog
          open
          label={uploadTarget.label}
          policy={overview.upload}
          submitting={uploading}
          serverError={uploadError}
          initialFile={seedFile}
          onClose={() => {
            if (!uploading) {
              setUploadType(null);
              setSeedFile(null);
            }
          }}
          onSubmit={(file) => void send(file)}
        />
      ) : null}

      {deleteTarget ? (
        <Modal
          open
          title="حذف مدرک"
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        >
          <p className="text-sm leading-6 text-[#6B7280]">
            «{deleteTarget.label}» حذف شود؟ تا قبل از شروع بررسی می‌توانید آن را بردارید و بعداً دوباره بارگذاری کنید.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-sm font-medium"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              انصراف
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#DC2626] text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void removeDocument()}
              disabled={deleting}
            >
              {deleting ? 'در حال حذف…' : 'حذف مدرک'}
            </button>
          </div>
        </Modal>
      ) : null}

      <DocumentViewer
        open={viewTarget !== null}
        label={viewTarget?.label ?? 'مدرک'}
        documentId={viewTarget?.file?.id ?? null}
        mime={viewTarget?.file?.fileMimeType ?? ''}
        fileName={viewTarget?.file?.fileName ?? ''}
        onClose={() => setViewId(null)}
      />
    </div>
  );
}

function PhaseIcon({ phase }: { phase: KycPhase }) {
  if (phase === 'VERIFIED' || phase === 'UNDER_REVIEW') return <ShieldCheck className="h-5 w-5" />;
  if (phase === 'NEEDS_CORRECTION') return <AlertTriangle className="h-5 w-5" />;
  if (phase === 'REJECTED') return <X className="h-5 w-5" />;
  if (phase === 'SUBMITTED') return <Clock3 className="h-5 w-5" />;
  if (phase === 'IN_PROGRESS') return <CheckCircle2 className="h-5 w-5" />;
  return <span className="text-lg leading-none">○</span>;
}

function DocumentIcon({ type }: { type: string }) {
  const className = 'h-5 w-5';
  if (type === 'birth_certificate') return <BookOpen className={className} aria-hidden />;
  if (type === 'proof_of_address') return <Home className={className} aria-hidden />;
  if (type === 'selfie_with_id') return <UserRound className={className} aria-hidden />;
  if (type === 'personal_photo') return <Camera className={className} aria-hidden />;
  if (type === 'business_registration') return <Store className={className} aria-hidden />;
  return <CreditCard className={className} aria-hidden />;
}

function StatusGlyph({ status }: { status: KycDocumentDisplayStatus }) {
  if (status === 'APPROVED') return <Check className="h-3.5 w-3.5" aria-hidden />;
  if (status === 'UNDER_REVIEW' || status === 'SUBMITTED') return <Clock3 className="h-3.5 w-3.5" aria-hidden />;
  if (status === 'REJECTED') return <X className="h-3.5 w-3.5" aria-hidden />;
  return <AlertTriangle className="h-3.5 w-3.5" aria-hidden />;
}

function DocumentCard({
  document,
  onUpload,
  onEdit,
  onView,
  onDelete,
}: {
  document: OwnKycDocument;
  onUpload: () => void;
  onEdit: () => void;
  onView: () => void;
  onDelete: () => void;
}) {
  const status = document.displayStatus;
  const reason = document.file?.rejectionReason;
  const showReason = (status === 'NEEDS_CORRECTION' || status === 'REJECTED') && Boolean(reason);
  const imageUploaded = Boolean(document.file?.fileMimeType.startsWith('image/'));
  return (
    <article className={cn('flex min-w-0 flex-col rounded-2xl border p-4 shadow-sm', CARD_SHELL[status])}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[#C8922E]">
            <DocumentIcon type={document.type} />
          </span>
          <h3 className="truncate text-sm font-bold text-[#202124]">{document.label}</h3>
        </div>
      </div>
      <p className={cn('mt-3 inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold', BADGE[status])}>
        <StatusGlyph status={status} />
        {DOCUMENT_STATUS_LABEL[status]}
      </p>
      {showReason ? <p className="mt-2 text-xs leading-5 text-[#DC2626]">{reason}</p> : null}
      <div className="mt-3">
        {document.file ? (
          <DocumentThumbnail
            documentId={document.file.id}
            mime={document.file.fileMimeType}
            fileName={document.file.fileName}
            label={document.label}
            onOpen={onView}
          />
        ) : (
          <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-[#FECACA] bg-white/70 text-xs text-[#6B7280]">
            مدرکی بارگذاری نشده است
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2">
        {document.file ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-sm font-semibold text-[#202124]"
            onClick={onView}
          >
            مشاهده مدرک
          </button>
        ) : null}
        {document.canUpload && imageUploaded ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-sm font-semibold text-[#202124]"
            onClick={onEdit}
          >
            ویرایش تصویر
          </button>
        ) : null}
        {document.canUpload ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#C8922E] text-sm font-semibold text-white"
            onClick={onUpload}
          >
            {document.file ? 'بارگذاری مجدد' : 'آپلود مدرک'}
          </button>
        ) : null}
        {document.canDelete ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#FECACA] bg-white text-sm font-semibold text-[#DC2626]"
            onClick={onDelete}
          >
            حذف مدرک
          </button>
        ) : null}
        {!document.file && !document.canUpload ? (
          <p className="text-center text-xs leading-5 text-[#6B7280]">در این مرحله امکان بارگذاری نیست.</p>
        ) : null}
      </div>
    </article>
  );
}

function DocumentThumbnail({
  documentId,
  mime,
  fileName,
  label,
  onOpen,
}: {
  documentId: string;
  mime: string;
  fileName: string;
  label: string;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [seen, setSeen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isImage = mime.startsWith('image/');

  useEffect(() => {
    const element = ref.current;
    if (!element || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
      },
      { rootMargin: '120px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen || !isImage) return;
    let active = true;
    let objectUrl: string | null = null;
    setFailed(false);
    kycApi
      .getOwnDocumentFile(documentId)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [seen, isImage, documentId]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      className="block w-full overflow-hidden rounded-xl border border-white/80 bg-white text-right"
      aria-label={`پیش‌نمایش ${label}`}
    >
      {isImage && url ? (
        <img src={url} alt="" className="h-36 w-full bg-[#F8F9FA] object-contain" />
      ) : (
        <div className="flex h-36 flex-col items-center justify-center gap-1 px-3 text-center">
          <FileText className="h-6 w-6 text-[#6B7280]" aria-hidden />
          <p className="max-w-full truncate text-xs text-[#6B7280]">
            {failed ? 'پیش‌نمایش در دسترس نیست' : isImage ? 'در حال آماده‌سازی پیش‌نمایش' : fileName}
          </p>
        </div>
      )}
    </button>
  );
}

function DocumentViewer({
  open,
  label,
  documentId,
  mime,
  fileName,
  onClose,
}: {
  open: boolean;
  label: string;
  documentId: string | null;
  mime: string;
  fileName: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !documentId) return;
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);
    kycApi
      .getOwnDocumentFile(documentId)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, documentId]);

  return (
    <Modal open={open} onClose={onClose} title={label} className="mx-4 max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto">
      {failed ? <p className="text-sm text-[#DC2626]">مشاهده مدرک انجام نشد. لطفاً دوباره تلاش کنید.</p> : null}
      {!failed && !url ? <p className="text-sm text-[#6B7280]">در حال دریافت مدرک…</p> : null}
      {url && mime.startsWith('image/') ? (
        <img src={url} alt={label} className="max-h-[70vh] w-full rounded-xl object-contain" />
      ) : null}
      {url && mime === 'application/pdf' ? (
        <iframe title={label} src={url} className="h-[70vh] w-full rounded-xl border border-[#E5E7EB]" />
      ) : null}
      {url && !mime.startsWith('image/') && mime !== 'application/pdf' ? (
        <p className="text-sm text-[#202124]">{fileName}</p>
      ) : null}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#E5E7EB] px-4 text-sm font-medium"
          onClick={onClose}
        >
          بستن
        </button>
      </div>
    </Modal>
  );
}

function HistoryStatus({ label, tone }: { label: string; tone: 'done' | 'pending' | 'rejected' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold',
        tone === 'done' && 'text-[#16A34A]',
        tone === 'pending' && 'text-[#B45309]',
        tone === 'rejected' && 'text-[#DC2626]',
      )}
    >
      {tone === 'done' ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
      {tone === 'pending' ? <Clock3 className="h-3.5 w-3.5" aria-hidden /> : null}
      {tone === 'rejected' ? <X className="h-3.5 w-3.5" aria-hidden /> : null}
      {label}
    </span>
  );
}

export function KycSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4" aria-busy="true" aria-label="در حال دریافت احراز هویت">
      <div className="h-36 animate-pulse rounded-2xl bg-white" />
      <div className="h-24 animate-pulse rounded-2xl bg-white" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="h-56 animate-pulse rounded-2xl bg-white" />
        <div className="h-56 animate-pulse rounded-2xl bg-white" />
      </div>
      <div className="h-28 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}

export function KycLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="mx-auto max-w-lg rounded-2xl border border-[#E5E7EB] bg-white p-6 text-center shadow-sm">
      <p className="text-sm font-medium text-[#202124]">اطلاعات احراز هویت در حال حاضر قابل دریافت نیست.</p>
      <button
        type="button"
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#C8922E] px-5 text-sm font-semibold text-white"
        onClick={onRetry}
      >
        تلاش مجدد
      </button>
    </section>
  );
}
