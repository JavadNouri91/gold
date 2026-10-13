'use client';

import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

const VIEWPORT_SIZE = 280;
const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.05;

interface Point {
  x: number;
  y: number;
}

interface ImageSize {
  width: number;
  height: number;
}

export function AvatarImageEditor({
  file,
  onCancel,
  onApply,
}: {
  file: File;
  onCancel: () => void;
  onApply: (file: File) => Promise<void> | void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; start: Point; offset: Point } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [viewportSize, setViewportSize] = useState(VIEWPORT_SIZE);
  const [zoom, setZoom] = useState(1.15);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => setViewportSize(viewport.clientWidth || VIEWPORT_SIZE);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const dimensions = imageSize ? renderedDimensions(imageSize, zoom, viewportSize) : null;
  const constrainedOffset =
    dimensions == null
      ? offset
      : clampOffset(offset, dimensions.width, dimensions.height, viewportSize);

  const updateZoom = (nextZoom: number) => {
    const value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    setZoom(value);
    if (imageSize) {
      const next = renderedDimensions(imageSize, value, viewportSize);
      setOffset((current) => clampOffset(current, next.width, next.height, viewportSize));
    }
  };

  const move = (next: Point) => {
    if (!dimensions) return;
    setOffset(clampOffset(next, dimensions.width, dimensions.height, viewportSize));
  };

  const apply = async () => {
    if (!imageSize || !imageRef.current) return;
    setWorking(true);
    setError(null);
    try {
      const edited = await exportAvatar(
        imageRef.current,
        imageSize,
        zoom,
        constrainedOffset,
        viewportSize,
        file.name,
      );
      await onApply(edited);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'آماده‌سازی تصویر انجام نشد.');
      setWorking(false);
    }
  };

  return (
    <div>
      <p className="text-sm leading-6 text-slate-600">
        چهره را داخل کادر قرار دهید. برای جابه‌جایی، تصویر را بکشید و با نوار زیر روی آن زوم کنید.
      </p>

      <div className="mt-4 rounded-2xl bg-slate-950 p-4 sm:p-6">
        <div
          ref={viewportRef}
          role="application"
          aria-label="تنظیم محل چهره. تصویر را بکشید یا با کلیدهای جهت جابه‌جا کنید."
          tabIndex={0}
          className="relative mx-auto aspect-square w-[min(280px,calc(100vw-2rem))] touch-none overflow-hidden rounded-full bg-slate-900 outline-none ring-4 ring-white/90 focus-visible:ring-[#D99A00]"
          onPointerDown={(event) => {
            if (!dimensions) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = {
              pointerId: event.pointerId,
              start: { x: event.clientX, y: event.clientY },
              offset: constrainedOffset,
            };
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            move({
              x: drag.offset.x + event.clientX - drag.start.x,
              y: drag.offset.y + event.clientY - drag.start.y,
            });
          }}
          onPointerUp={(event) => {
            if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 10 : 3;
            if (event.key === 'ArrowLeft') move({ ...constrainedOffset, x: constrainedOffset.x - step });
            else if (event.key === 'ArrowRight') move({ ...constrainedOffset, x: constrainedOffset.x + step });
            else if (event.key === 'ArrowUp') move({ ...constrainedOffset, y: constrainedOffset.y - step });
            else if (event.key === 'ArrowDown') move({ ...constrainedOffset, y: constrainedOffset.y + step });
            else return;
            event.preventDefault();
          }}
        >
          {previewUrl ? (
            <img
              ref={imageRef}
              src={previewUrl}
              alt="پیش‌نمایش عکس پروفایل"
              draggable={false}
              onLoad={(event) => {
                setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
              }}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={
                dimensions
                  ? {
                      width: dimensions.width,
                      height: dimensions.height,
                      transform: `translate(calc(-50% + ${constrainedOffset.x}px), calc(-50% + ${constrainedOffset.y}px))`,
                    }
                  : { opacity: 0 }
              }
            />
          ) : null}
          <span
            className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/70"
            aria-hidden
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3" dir="ltr">
        <button
          type="button"
          aria-label="کاهش بزرگ‌نمایی"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D99A00]"
          onClick={() => updateZoom(zoom - ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM || working}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <label className="sr-only" htmlFor="avatar-zoom">
          بزرگ‌نمایی چهره
        </label>
        <input
          id="avatar-zoom"
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={ZOOM_STEP}
          value={zoom}
          onChange={(event) => updateZoom(Number(event.target.value))}
          className="h-2 w-full cursor-pointer accent-[#D99A00]"
          disabled={working}
        />
        <button
          type="button"
          aria-label="افزایش بزرگ‌نمایی"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D99A00]"
          onClick={() => updateZoom(zoom + ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM || working}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={working}>
          انصراف
        </Button>
        <Button type="button" onClick={() => void apply()} disabled={!imageSize || working}>
          {working ? 'در حال ذخیره…' : 'ذخیره عکس'}
        </Button>
      </div>
    </div>
  );
}

function renderedDimensions(image: ImageSize, zoom: number, viewportSize: number): ImageSize {
  const coverScale = Math.max(viewportSize / image.width, viewportSize / image.height);
  return {
    width: image.width * coverScale * zoom,
    height: image.height * coverScale * zoom,
  };
}

function clampOffset(
  offset: Point,
  width: number,
  height: number,
  viewportSize: number,
): Point {
  const maxX = Math.max(0, (width - viewportSize) / 2);
  const maxY = Math.max(0, (height - viewportSize) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

async function exportAvatar(
  image: HTMLImageElement,
  imageSize: ImageSize,
  zoom: number,
  offset: Point,
  viewportSize: number,
  originalName: string,
): Promise<File> {
  const displayed = renderedDimensions(imageSize, zoom, viewportSize);
  const scale = displayed.width / imageSize.width;
  const sourceSize = viewportSize / scale;
  const sourceX = imageSize.width / 2 - sourceSize / 2 - offset.x / scale;
  const sourceY = imageSize.height / 2 - sourceSize / 2 - offset.y / scale;
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('آماده‌سازی تصویر انجام نشد.');
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.9),
  );
  if (!blob) throw new Error('آماده‌سازی تصویر انجام نشد.');
  const base = originalName.replace(/\.[^.]+$/, '') || 'avatar';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}
