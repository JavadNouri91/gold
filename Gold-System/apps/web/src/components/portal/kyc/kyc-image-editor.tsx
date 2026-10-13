'use client';

import { useEffect, useRef, useState } from 'react';
import { FlipHorizontal, RotateCcw, RotateCw, Wand2 } from 'lucide-react';
import {
  FULL_CROP,
  exportEditedImage,
  normalizeTurns,
  orientedPreviewUrl,
  resizeCrop,
  type CropHandle,
  type NormCrop,
} from '@/lib/kyc-image-edit';
import { PortraitMatteError, removePersonalPhotoBackground } from '@/lib/kyc-portrait-matte';

interface KycImageEditorProps {
  file: File;
  maxBytes: number;
  skipLabel?: string;
  applyLabel?: string;
  allowBackgroundRemoval?: boolean;
  onUseOriginal: () => void;
  onApply: (file: File) => void;
  onError: (message: string) => void;
}

const CHECKERBOARD =
  'bg-[length:16px_16px] bg-[linear-gradient(45deg,#4b5563_25%,transparent_25%),linear-gradient(-45deg,#4b5563_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#4b5563_75%),linear-gradient(-45deg,transparent_75%,#4b5563_75%)] bg-[position:0_0,0_8px,8px_-8px,-8px_0]';

const HANDLES: Array<{ id: Exclude<CropHandle, 'move'>; className: string; label: string }> = [
  { id: 'nw', className: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize', label: 'گوشه بالا چپ' },
  { id: 'ne', className: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize', label: 'گوشه بالا راست' },
  { id: 'sw', className: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize', label: 'گوشه پایین چپ' },
  { id: 'se', className: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize', label: 'گوشه پایین راست' },
];

export function KycImageEditor({
  file,
  maxBytes,
  skipLabel = 'ادامه بدون تغییر',
  applyLabel = 'اعمال و پیش‌نمایش',
  allowBackgroundRemoval = false,
  onUseOriginal,
  onApply,
  onError,
}: KycImageEditorProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    handle: CropHandle;
    x: number;
    y: number;
    crop: NormCrop;
    width: number;
    height: number;
  } | null>(null);
  const [turns, setTurns] = useState(0);
  const [flip, setFlip] = useState(false);
  const [crop, setCrop] = useState<NormCrop>(FULL_CROP);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [working, setWorking] = useState(false);
  const [workingFile, setWorkingFile] = useState(file);
  const [cutout, setCutout] = useState(file.type === 'image/png');
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    setWorkingFile(file);
    setCutout(file.type === 'image/png');
    setTurns(0);
    setFlip(false);
    setCrop(FULL_CROP);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setPreparing(true);
    orientedPreviewUrl(workingFile, turns, flip)
      .then((next) => {
        if (!active) {
          URL.revokeObjectURL(next);
          return;
        }
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        previewRef.current = next;
        setPreviewUrl(next);
      })
      .catch(() => {
        if (active) onErrorRef.current('تصویر قابل خواندن نیست.');
      })
      .finally(() => {
        if (active) setPreparing(false);
      });
    return () => {
      active = false;
    };
  }, [workingFile, turns, flip]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.width <= 0 || drag.height <= 0) return;
      const dx = (event.clientX - drag.x) / drag.width;
      const dy = (event.clientY - drag.y) / drag.height;
      setCrop(resizeCrop(drag.crop, drag.handle, dx, dy));
    };
    const stop = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
  }, []);

  const beginDrag = (handle: CropHandle, event: React.PointerEvent) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      handle,
      x: event.clientX,
      y: event.clientY,
      crop,
      width: rect.width,
      height: rect.height,
    };
  };

  const nudge = (dx: number, dy: number) => setCrop((current) => resizeCrop(current, 'move', dx, dy));

  const rotate = (delta: number) => {
    setTurns((current) => normalizeTurns(current + delta));
    setCrop(FULL_CROP);
  };

  const apply = async () => {
    setWorking(true);
    try {
      const edited = await exportEditedImage(workingFile, turns, flip, crop, maxBytes);
      onApply(edited);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'آماده‌سازی تصویر انجام نشد.');
    } finally {
      setWorking(false);
    }
  };

  const removeBackground = async () => {
    setWorking(true);
    try {
      const prepared = await exportEditedImage(workingFile, turns, flip, crop, maxBytes);
      const next = await removePersonalPhotoBackground(prepared, maxBytes);
      setWorkingFile(next);
      setCutout(true);
      setTurns(0);
      setFlip(false);
      setCrop(FULL_CROP);
    } catch (error) {
      onError(
        error instanceof PortraitMatteError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'حذف پس‌زمینه انجام نشد. تصویر اصلی بدون تغییر ماند.',
      );
    } finally {
      setWorking(false);
    }
  };

  const restoreBackground = () => {
    setWorkingFile(file);
    setCutout(false);
    setTurns(0);
    setFlip(false);
    setCrop(FULL_CROP);
  };

  return (
    <div className="mt-4">
      <p className="text-sm leading-6 text-[#6B7280]">
        {allowBackgroundRemoval
          ? 'تصویر را بچرخانید، برش دهید یا پس‌زمینه عکس پرسنلی را حذف کنید. نسخه اصلی برای بررسی نگه داشته می‌شود.'
          : 'تصویر را بچرخانید و با کشیدن کادر، بخش مهم مدرک را برش دهید.'}
      </p>
      <div className="mt-3 rounded-2xl border border-[#E5E7EB] bg-[#111827] p-6">
        <div ref={frameRef} dir="ltr" className="relative mx-auto w-full max-w-[420px]">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="پیش‌نمایش قابل ویرایش"
              className={`block h-auto w-full select-none ${cutout ? CHECKERBOARD : ''}`}
              draggable={false}
            />
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-white">
              {preparing ? 'در حال آماده‌سازی تصویر…' : 'تصویر در دسترس نیست'}
            </div>
          )}
          {previewUrl ? (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div
                className="absolute shadow-[0_0_0_9999px_rgba(17,24,39,0.55)]"
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.w * 100}%`,
                  height: `${crop.h * 100}%`,
                }}
              />
            </div>
          ) : null}
          {previewUrl ? (
            <div
              role="application"
              aria-label="ناحیه برش تصویر. برای جابه‌جایی بکشید یا از کلیدهای جهت استفاده کنید."
              tabIndex={0}
              className="absolute touch-none border-2 border-white"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.w * 100}%`,
                height: `${crop.h * 100}%`,
              }}
              onPointerDown={(event) => beginDrag('move', event)}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 0.04 : 0.01;
                if (event.key === 'ArrowLeft') nudge(-step, 0);
                else if (event.key === 'ArrowRight') nudge(step, 0);
                else if (event.key === 'ArrowUp') nudge(0, -step);
                else if (event.key === 'ArrowDown') nudge(0, step);
                else return;
                event.preventDefault();
              }}
            >
              {HANDLES.map((handle) => (
                <button
                  key={handle.id}
                  type="button"
                  aria-label={handle.label}
                  className={`absolute z-10 flex h-11 w-11 items-center justify-center ${handle.className}`}
                  onPointerDown={(event) => beginDrag(handle.id, event)}
                >
                  <span className="h-3.5 w-3.5 rounded-sm border-2 border-[#C8922E] bg-white" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`mt-3 grid gap-2 ${allowBackgroundRemoval ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-2 text-xs font-medium text-[#202124]"
          onClick={() => rotate(-1)}
          disabled={working}
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          چرخش چپ
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-2 text-xs font-medium text-[#202124]"
          onClick={() => rotate(1)}
          disabled={working}
        >
          <RotateCw className="h-4 w-4" aria-hidden />
          چرخش راست
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-2 text-xs font-medium text-[#202124]"
          onClick={() => {
            setFlip((current) => !current);
            setCrop(FULL_CROP);
          }}
          disabled={working}
        >
          <FlipHorizontal className="h-4 w-4" aria-hidden />
          آینه
        </button>
        {allowBackgroundRemoval ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-2 text-xs font-medium text-[#202124] disabled:opacity-60"
            onClick={() => void (cutout ? restoreBackground() : removeBackground())}
            disabled={working || preparing}
          >
            <Wand2 className="h-4 w-4" aria-hidden />
            {working ? 'در حال پردازش…' : cutout ? 'بازگرداندن پس‌زمینه' : 'حذف پس‌زمینه'}
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-sm font-medium"
          onClick={onUseOriginal}
          disabled={working}
        >
          {skipLabel}
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#C8922E] text-sm font-semibold text-white disabled:opacity-60"
          onClick={() => void apply()}
          disabled={working || preparing || !previewUrl}
        >
          {working ? 'در حال آماده‌سازی…' : applyLabel}
        </button>
      </div>
    </div>
  );
}
