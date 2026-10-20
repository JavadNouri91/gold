'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, FileText } from 'lucide-react';
import { kycApi, type OwnKycDocument, type OwnKycOverview } from '@/lib/api';
import { formatKycDateTime } from '@/lib/kyc-present';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import { Modal } from '@/components/ui/modal';
import { KycExperience } from '@/components/portal/kyc/kyc-experience';

export function ProfileKycPanel({
  overview,
  onChanged,
}: {
  overview: OwnKycOverview;
  onChanged: () => Promise<unknown>;
}) {
  if (overview.phase !== 'VERIFIED') {
    return <KycExperience overview={overview} onChanged={onChanged} />;
  }

  return <VerifiedKycDocuments overview={overview} />;
}

function VerifiedKycDocuments({ overview }: { overview: OwnKycOverview }) {
  const [viewId, setViewId] = useState<string | null>(null);
  const viewTarget = overview.documents.find((item) => item.file?.id === viewId) ?? null;
  const history = overview.history.slice(0, 6);

  return (
    <div className="space-y-4">
      <Alert variant="success" className="border-emerald-100 bg-emerald-50 text-emerald-900">
        <span className="inline-flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <span>
            هویت شما با موفقیت تایید شده است و تمامی امکانات معاملاتی فعال می‌باشند.
          </span>
        </span>
      </Alert>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:p-5">
        <h2 className="text-base font-bold text-slate-800">مدارک بارگذاری‌شده</h2>
        <p className="mt-1 text-sm text-muted-foreground">تمام مدارک هویتی شما تأیید شده‌اند.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {overview.documents.map((document) => (
            <VerifiedDocumentCard
              key={document.type}
              document={document}
              onView={() => document.file && setViewId(document.file.id)}
            />
          ))}
        </div>
      </section>

      {history.length > 0 ? (
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:p-5">
          <h2 className="text-base font-bold text-slate-800">تاریخچه و سوابق بررسی مدارک</h2>
          <div className="mt-3 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[28rem] text-right text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-muted-foreground">
                  <th className="px-2 py-2 font-medium">تاریخ و زمان</th>
                  <th className="px-2 py-2 font-medium">مرحله</th>
                  <th className="px-2 py-2 font-medium">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {history.map((event) => (
                  <tr key={event.id} className="border-b border-slate-50 last:border-0">
                    <td className="whitespace-nowrap px-2 py-3 text-slate-800">
                      {formatKycDateTime(event.occurredAt)}
                    </td>
                    <td className="px-2 py-3 font-medium text-slate-800">{event.title}</td>
                    <td className="px-2 py-3">
                      <span
                        className={cn(
                          'text-xs font-semibold',
                          event.tone === 'done' && 'text-emerald-700',
                          event.tone === 'pending' && 'text-amber-700',
                          event.tone === 'rejected' && 'text-red-700',
                        )}
                      >
                        {event.statusLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ol className="mt-3 space-y-3 md:hidden">
            {history.map((event) => (
              <li key={event.id} className="rounded-xl border border-slate-100 p-3">
                <p className="text-xs text-muted-foreground">{formatKycDateTime(event.occurredAt)}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-800">{event.title}</p>
                  <span
                    className={cn(
                      'text-xs font-semibold',
                      event.tone === 'done' && 'text-emerald-700',
                      event.tone === 'pending' && 'text-amber-700',
                      event.tone === 'rejected' && 'text-red-700',
                    )}
                  >
                    {event.statusLabel}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <VerifiedDocumentViewer
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

function VerifiedDocumentCard({
  document,
  onView,
}: {
  document: OwnKycDocument;
  onView: () => void;
}) {
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="truncate text-sm font-bold text-slate-800">{document.label}</h3>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
          <Check className="h-3 w-3" aria-hidden />
          تایید شده
        </span>
      </div>
      <div className="mt-3">
        {document.file ? (
          <VerifiedThumbnail
            documentId={document.file.id}
            mime={document.file.hasProcessedFile ? 'image/png' : document.file.fileMimeType}
            fileName={document.file.fileName}
            label={document.label}
            processed={Boolean(document.file.hasProcessedFile)}
            onOpen={onView}
          />
        ) : (
          <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-emerald-200 bg-white/70 text-xs text-muted-foreground">
            پیش‌نمایش در دسترس نیست
          </div>
        )}
      </div>
      {document.file ? (
        <button
          type="button"
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50"
          onClick={onView}
        >
          مشاهده تصویر
        </button>
      ) : null}
    </article>
  );
}

function VerifiedThumbnail({
  documentId,
  mime,
  fileName,
  label,
  processed = false,
  onOpen,
}: {
  documentId: string;
  mime: string;
  fileName: string;
  label: string;
  processed?: boolean;
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
      .getOwnDocumentFile(documentId, processed)
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
  }, [seen, isImage, documentId, processed]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      className="block w-full overflow-hidden rounded-xl border border-white bg-white text-right"
      aria-label={`پیش‌نمایش ${label}`}
    >
      {isImage && url ? (
        <img src={url} alt="" className="h-36 w-full bg-slate-50 object-contain" />
      ) : (
        <div className="flex h-36 flex-col items-center justify-center gap-1 px-3 text-center">
          <FileText className="h-6 w-6 text-slate-400" aria-hidden />
          <p className="max-w-full truncate text-xs text-muted-foreground">
            {failed ? 'پیش‌نمایش در دسترس نیست' : isImage ? 'در حال آماده‌سازی پیش‌نمایش' : fileName}
          </p>
        </div>
      )}
    </button>
  );
}

function VerifiedDocumentViewer({
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
    <Modal
      open={open}
      onClose={onClose}
      title={label}
      className="mx-4 max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto"
    >
      {failed ? <p className="text-sm text-red-700">مشاهده مدرک انجام نشد. لطفاً دوباره تلاش کنید.</p> : null}
      {!failed && !url ? <p className="text-sm text-muted-foreground">در حال دریافت مدرک…</p> : null}
      {url && mime.startsWith('image/') ? (
        <img src={url} alt={label} className="max-h-[70vh] w-full rounded-xl object-contain" />
      ) : null}
      {url && mime === 'application/pdf' ? (
        <iframe title={label} src={url} className="h-[70vh] w-full rounded-xl border border-slate-200" />
      ) : null}
      {url && !mime.startsWith('image/') && mime !== 'application/pdf' ? (
        <p className="text-sm text-slate-800">{fileName}</p>
      ) : null}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-medium"
          onClick={onClose}
        >
          بستن
        </button>
      </div>
    </Modal>
  );
}
