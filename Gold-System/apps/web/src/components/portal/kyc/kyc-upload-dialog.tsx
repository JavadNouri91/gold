'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Camera, FileText, ImageIcon, Trash2, Upload } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { KycImageEditor } from '@/components/portal/kyc/kyc-image-editor';
import { formatMaxSize, resolvedFileMime, validateKycFile } from '@/lib/kyc-present';

interface KycUploadDialogProps {
  open: boolean;
  label: string;
  policy: { maxBytes: number; mimeTypes: string[] };
  submitting: boolean;
  serverError: string | null;
  initialFile?: File | null;
  onClose: () => void;
  onSubmit: (file: File) => void;
}

type Stage = 'pick' | 'edit' | 'ready';

export function KycUploadDialog({
  open,
  label,
  policy,
  submitting,
  serverError,
  initialFile = null,
  onClose,
  onSubmit,
}: KycUploadDialogProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadedSeed = useRef<File | null>(null);
  const [stage, setStage] = useState<Stage>('pick');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [readyFile, setReadyFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (open) return;
    loadedSeed.current = null;
    setStage('pick');
    setSourceFile(null);
    setReadyFile(null);
    setPreviewUrl(null);
    setError(null);
  }, [open]);

  const accept = policy.mimeTypes.join(',');

  const showReady = (file: File) => {
    const problem = validateKycFile(file, policy);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setReadyFile(file);
    setStage('ready');
    if (resolvedFileMime(file).startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
    } else {
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    }
  };

  const choose = (list: FileList | null) => {
    const next = list?.item(0) ?? null;
    const problem = validateKycFile(next, policy);
    if (problem || !next) {
      setError(problem ?? 'فایل انتخاب نشده است.');
      return;
    }
    setError(null);
    setSourceFile(next);
    if (resolvedFileMime(next).startsWith('image/')) {
      setStage('edit');
      return;
    }
    showReady(next);
  };

  useEffect(() => {
    if (!open || !initialFile || loadedSeed.current === initialFile) return;
    loadedSeed.current = initialFile;
    const problem = validateKycFile(initialFile, policy);
    if (problem) {
      setError(problem);
      return;
    }
    setSourceFile(initialFile);
    if (resolvedFileMime(initialFile).startsWith('image/')) {
      setStage('edit');
      return;
    }
    setError(null);
    setReadyFile(initialFile);
    setStage('ready');
  }, [open, initialFile, policy]);

  const clear = () => {
    setStage('pick');
    setSourceFile(null);
    setReadyFile(null);
    setPreviewUrl(null);
    setError(null);
    if (cameraRef.current) cameraRef.current.value = '';
    if (galleryRef.current) galleryRef.current.value = '';
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Modal
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title={`ارسال ${label}`}
      className="mx-4 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto"
    >
      <p className="text-sm leading-6 text-[#6B7280]">
        تصویر یا فایل خود را انتخاب کنید. فرمت‌های مجاز JPG، PNG، WEBP و PDF تا {formatMaxSize(policy.maxBytes)} است.
      </p>

      {error || serverError ? (
        <p role="alert" className="mt-3 text-sm font-medium text-[#DC2626]">
          {error || serverError}
        </p>
      ) : null}

      {stage === 'edit' && sourceFile ? (
        <KycImageEditor
          file={sourceFile}
          maxBytes={policy.maxBytes}
          onUseOriginal={() => showReady(sourceFile)}
          onApply={showReady}
          onError={setError}
        />
      ) : null}

      {stage === 'ready' && readyFile ? (
        <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-[#F8F9FA] p-4">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={`پیش‌نمایش ${label}`}
              className="mx-auto max-h-64 w-full rounded-xl bg-white object-contain"
            />
          ) : (
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 shrink-0 text-[#6B7280]" aria-hidden />
              <p className="min-w-0 truncate text-sm font-medium text-[#202124]">{readyFile.name}</p>
            </div>
          )}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {resolvedFileMime(sourceFile ?? readyFile).startsWith('image/') && sourceFile ? (
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-medium text-[#202124]"
                onClick={() => setStage('edit')}
                disabled={submitting}
              >
                ویرایش تصویر
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-medium text-[#202124]"
                onClick={() => fileRef.current?.click()}
                disabled={submitting}
              >
                تغییر فایل
              </button>
            )}
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-medium text-[#DC2626]"
              onClick={clear}
              disabled={submitting}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              حذف
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#C8922E] px-3 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => onSubmit(readyFile)}
              disabled={submitting}
            >
              {submitting ? 'در حال ارسال…' : 'ارسال مدرک'}
            </button>
          </div>
        </div>
      ) : null}

      {stage === 'pick' ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[#E5E7EB] bg-[#F8F9FA] px-4 py-6 text-center">
          <Upload className="mx-auto h-7 w-7 text-[#C8922E]" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-[#202124]">آپلود مدرک</p>
          <p className="mt-1 text-xs text-[#6B7280]">تصویر یا فایل خود را انتخاب کنید</p>
          <div className="mt-4 grid grid-cols-1 gap-2">
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white text-sm font-medium"
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="h-4 w-4" aria-hidden />
              دوربین
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white text-sm font-medium"
              onClick={() => galleryRef.current?.click()}
            >
              <ImageIcon className="h-4 w-4" aria-hidden />
              گالری
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white text-sm font-medium"
              onClick={() => fileRef.current?.click()}
            >
              <FileText className="h-4 w-4" aria-hidden />
              فایل
            </button>
          </div>
        </div>
      ) : null}

      <input
        id={`${inputId}-camera`}
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="گرفتن عکس با دوربین"
        onChange={(event) => choose(event.target.files)}
      />
      <input
        id={`${inputId}-gallery`}
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="انتخاب تصویر از گالری"
        onChange={(event) => choose(event.target.files)}
      />
      <input
        id={`${inputId}-file`}
        ref={fileRef}
        type="file"
        accept={accept}
        className="sr-only"
        aria-label={`انتخاب فایل ${label}`}
        onChange={(event) => choose(event.target.files)}
      />
    </Modal>
  );
}
