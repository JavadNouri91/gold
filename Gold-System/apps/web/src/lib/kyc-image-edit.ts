export interface NormCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_CROP: NormCrop = { x: 0, y: 0, w: 1, h: 1 };
export const MIN_CROP = 0.12;

export type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeTurns(turns: number): number {
  return ((turns % 4) + 4) % 4;
}

/** Keeps the crop inside the image and above the minimum size. */
export function clampCrop(crop: NormCrop): NormCrop {
  const w = clamp(crop.w, MIN_CROP, 1);
  const h = clamp(crop.h, MIN_CROP, 1);
  const x = clamp(crop.x, 0, 1 - w);
  const y = clamp(crop.y, 0, 1 - h);
  return { x, y, w, h };
}

export function resizeCrop(start: NormCrop, handle: CropHandle, dx: number, dy: number): NormCrop {
  if (handle === 'move') {
    return clampCrop({ ...start, x: start.x + dx, y: start.y + dy });
  }
  let { x, y, w, h } = start;
  if (handle === 'se') {
    w = start.w + dx;
    h = start.h + dy;
  } else if (handle === 'sw') {
    x = start.x + dx;
    w = start.w - dx;
    h = start.h + dy;
  } else if (handle === 'ne') {
    y = start.y + dy;
    w = start.w + dx;
    h = start.h - dy;
  } else {
    x = start.x + dx;
    y = start.y + dy;
    w = start.w - dx;
    h = start.h - dy;
  }
  return clampCrop({ x, y, w, h });
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('تصویر قابل خواندن نیست.'));
      element.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('تصویر قابل خواندن نیست.');
    context.drawImage(image, 0, 0);
    return createImageBitmap(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawOriented(bitmap: ImageBitmap, turns: number, flip: boolean): HTMLCanvasElement {
  const quarter = normalizeTurns(turns);
  const swap = quarter % 2 === 1;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? bitmap.height : bitmap.width;
  canvas.height = swap ? bitmap.width : bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('تصویر قابل خواندن نیست.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((quarter * Math.PI) / 2);
  context.scale(flip ? -1 : 1, 1);
  context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  context.restore();
  return canvas;
}

function cropCanvas(source: HTMLCanvasElement, crop: NormCrop): HTMLCanvasElement {
  const frame = clampCrop(crop);
  const sx = Math.round(frame.x * source.width);
  const sy = Math.round(frame.y * source.height);
  const sw = Math.max(1, Math.round(frame.w * source.width));
  const sh = Math.max(1, Math.round(frame.h * source.height));
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('تصویر قابل خواندن نیست.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, sw, sh);
  context.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

function limitEdge(source: HTMLCanvasElement, maxEdge: number): HTMLCanvasElement {
  const longest = Math.max(source.width, source.height);
  if (longest <= maxEdge) return source;
  const scale = maxEdge / longest;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext('2d');
  if (!context) return source;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function blobWithinLimit(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob> {
  let current = canvas;
  let quality = 0.9;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const blob = await canvasToBlob(current, quality);
    if (blob && blob.size <= maxBytes && blob.size > 0) return blob;
    if (quality > 0.55) {
      quality -= 0.12;
      continue;
    }
    current = limitEdge(current, Math.round(Math.max(current.width, current.height) * 0.75));
    quality = 0.82;
  }
  const last = await canvasToBlob(current, 0.7);
  if (!last || last.size > maxBytes) {
    throw new Error('حجم فایل بیش از حد مجاز است.');
  }
  return last;
}

export async function exportEditedImage(
  file: File,
  turns: number,
  flip: boolean,
  crop: NormCrop,
  maxBytes: number,
): Promise<File> {
  const bitmap = await loadBitmap(file);
  try {
    const oriented = drawOriented(bitmap, turns, flip);
    const cropped = cropCanvas(oriented, crop);
    const limited = limitEdge(cropped, 2400);
    const blob = await blobWithinLimit(limited, maxBytes);
    const base = file.name.replace(/\.[^.]+$/, '') || 'document';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    bitmap.close?.();
  }
}

/** Smaller JPEG used only for the on-screen editor, not for upload. */
export async function orientedPreviewUrl(file: File, turns: number, flip: boolean): Promise<string> {
  const bitmap = await loadBitmap(file);
  try {
    const oriented = limitEdge(drawOriented(bitmap, turns, flip), 960);
    const blob = await canvasToBlob(oriented, 0.82);
    if (!blob) throw new Error('تصویر قابل خواندن نیست.');
    return URL.createObjectURL(blob);
  } finally {
    bitmap.close?.();
  }
}
