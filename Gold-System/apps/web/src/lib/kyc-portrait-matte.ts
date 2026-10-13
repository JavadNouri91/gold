export const PERSONAL_PHOTO_TYPE = 'personal_photo';

export class PortraitMatteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortraitMatteError';
  }
}

export interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const WORK_MAX = 512;
const FACE_GUARD = { cx: 0.5, cy: 0.4, rx: 0.28, ry: 0.34 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

function sampleBackground(raster: Raster): { r: number; g: number; b: number; spread: number } {
  const { data, width, height } = raster;
  const insetW = Math.max(2, Math.floor(width * 0.08));
  const insetH = Math.max(2, Math.floor(height * 0.08));
  const boxes = [
    { x: 0, y: 0 },
    { x: width - insetW, y: 0 },
    { x: 0, y: height - insetH },
    { x: width - insetW, y: height - insetH },
  ];
  const samples: number[][] = [];
  for (const box of boxes) {
    for (let y = box.y; y < box.y + insetH; y += 1) {
      for (let x = box.x; x < box.x + insetW; x += 1) {
        const i = (y * width + x) * 4;
        samples.push([data[i]!, data[i + 1]!, data[i + 2]!]);
      }
    }
  }
  const channel = (index: number) => {
    const values = samples.map((sample) => sample[index]!).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 255;
  };
  const r = channel(0);
  const g = channel(1);
  const b = channel(2);
  let spread = 0;
  for (const sample of samples) {
    spread += colorDist(sample[0]!, sample[1]!, sample[2]!, r, g, b);
  }
  return { r, g, b, spread: spread / Math.max(1, samples.length) };
}

function inFaceGuard(x: number, y: number, width: number, height: number): boolean {
  const nx = (x + 0.5) / width - FACE_GUARD.cx;
  const ny = (y + 0.5) / height - FACE_GUARD.cy;
  return (nx * nx) / (FACE_GUARD.rx * FACE_GUARD.rx) + (ny * ny) / (FACE_GUARD.ry * FACE_GUARD.ry) <= 1;
}

function floodBackground(raster: Raster, bg: { r: number; g: number; b: number; spread: number }): Uint8Array {
  const { data, width, height } = raster;
  const marked = new Uint8Array(width * height);
  const threshold = clamp(42 + bg.spread * 0.55, 36, 88);
  const queue: number[] = [];

  const trySeed = (x: number, y: number) => {
    const index = y * width + x;
    if (marked[index]) return;
    const i = index * 4;
    if (colorDist(data[i]!, data[i + 1]!, data[i + 2]!, bg.r, bg.g, bg.b) > threshold + 12) return;
    marked[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  while (queue.length > 0) {
    const index = queue.pop()!;
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx == null || ny == null || nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (marked[next]) continue;
      if (inFaceGuard(nx, ny, width, height)) continue;
      const i = next * 4;
      if (colorDist(data[i]!, data[i + 1]!, data[i + 2]!, bg.r, bg.g, bg.b) > threshold) continue;
      marked[next] = 1;
      queue.push(next);
    }
  }
  return marked;
}

function blurMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  const size = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = clamp(y + dy, 0, height - 1);
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = clamp(x + dx, 0, width - 1);
          sum += mask[yy * width + xx] ? 0 : 255;
          count += 1;
        }
      }
      out[y * width + x] = Math.round(sum / (count || size));
    }
  }
  return out;
}

function scaleMask(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sy = ((y + 0.5) * sourceHeight) / height - 0.5;
    const y0 = clamp(Math.floor(sy), 0, sourceHeight - 1);
    const y1 = clamp(y0 + 1, 0, sourceHeight - 1);
    const fy = sy - y0;
    for (let x = 0; x < width; x += 1) {
      const sx = ((x + 0.5) * sourceWidth) / width - 0.5;
      const x0 = clamp(Math.floor(sx), 0, sourceWidth - 1);
      const x1 = clamp(x0 + 1, 0, sourceWidth - 1);
      const fx = sx - x0;
      const v00 = source[y0 * sourceWidth + x0]!;
      const v10 = source[y0 * sourceWidth + x1]!;
      const v01 = source[y1 * sourceWidth + x0]!;
      const v11 = source[y1 * sourceWidth + x1]!;
      out[y * width + x] = Math.round(
        v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy,
      );
    }
  }
  return out;
}

function downscale(raster: Raster, maxEdge: number): Raster {
  const scale = Math.min(1, maxEdge / Math.max(raster.width, raster.height));
  if (scale >= 1) return raster;
  const width = Math.max(1, Math.round(raster.width * scale));
  const height = Math.max(1, Math.round(raster.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(raster.height - 1, Math.floor((y / height) * raster.height));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(raster.width - 1, Math.floor((x / width) * raster.width));
      const from = (sy * raster.width + sx) * 4;
      const to = (y * width + x) * 4;
      data[to] = raster.data[from]!;
      data[to + 1] = raster.data[from + 1]!;
      data[to + 2] = raster.data[from + 2]!;
      data[to + 3] = raster.data[from + 3]!;
    }
  }
  return { data, width, height };
}

export function assessPortraitMatte(
  mask: Uint8Array,
  width: number,
  height: number,
): { ok: boolean; reason: string } {
  let transparent = 0;
  let centerAlpha = 0;
  let centerCount = 0;
  let borderAlpha = 0;
  let borderCount = 0;
  const x0 = Math.floor(width * 0.35);
  const x1 = Math.floor(width * 0.65);
  const y0 = Math.floor(height * 0.22);
  const y1 = Math.floor(height * 0.58);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = mask[y * width + x]!;
      if (alpha < 40) transparent += 1;
      if (x >= x0 && x < x1 && y >= y0 && y < y1) {
        centerAlpha += alpha;
        centerCount += 1;
      }
      if (x < 3 || y < 3 || x >= width - 3 || y >= height - 3) {
        borderAlpha += alpha;
        borderCount += 1;
      }
    }
  }
  const clearRatio = transparent / Math.max(1, width * height);
  const face = centerAlpha / Math.max(1, centerCount);
  const edge = borderAlpha / Math.max(1, borderCount);
  if (clearRatio < 0.08) {
    return {
      ok: false,
      reason: 'پس‌زمینه این عکس به‌صورت یکنواخت قابل تشخیص نیست. تصویر اصلی بدون تغییر ماند.',
    };
  }
  if (clearRatio > 0.78 || face < 170) {
    return {
      ok: false,
      reason: 'حذف پس‌زمینه چهره را ناقص می‌کرد. تصویر اصلی بدون تغییر ماند.',
    };
  }
  if (edge > 140) {
    return {
      ok: false,
      reason: 'پس‌زمینه این عکس به‌صورت یکنواخت قابل تشخیص نیست. تصویر اصلی بدون تغییر ماند.',
    };
  }
  return { ok: true, reason: '' };
}

/** Builds a transparent PNG raster. Subject RGB is unchanged. */
export function applyPortraitMatte(raster: Raster): Raster {
  const work = downscale(raster, WORK_MAX);
  const background = sampleBackground(work);
  const flooded = floodBackground(work, background);
  const soft = blurMask(flooded, work.width, work.height, work.width > 180 ? 2 : 1);
  const quality = assessPortraitMatte(soft, work.width, work.height);
  if (!quality.ok) throw new PortraitMatteError(quality.reason);

  const alpha =
    work.width === raster.width && work.height === raster.height
      ? soft
      : scaleMask(soft, work.width, work.height, raster.width, raster.height);

  const data = new Uint8ClampedArray(raster.data);
  for (let i = 0, p = 0; i < alpha.length; i += 1, p += 4) {
    const a = alpha[i]!;
    data[p + 3] = a;
    if (a === 0) {
      data[p] = 0;
      data[p + 1] = 0;
      data[p + 2] = 0;
    }
  }
  return { data, width: raster.width, height: raster.height };
}

async function loadRaster(file: File): Promise<Raster> {
  const bitmap = await (typeof createImageBitmap === 'function'
    ? createImageBitmap(file)
    : new Promise<ImageBitmap>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
          URL.revokeObjectURL(url);
          resolve(image as unknown as ImageBitmap);
        };
        image.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new PortraitMatteError('تصویر قابل خواندن نیست.'));
        };
        image.src = url;
      }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new PortraitMatteError('تصویر قابل خواندن نیست.');
  context.drawImage(bitmap, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return { data: image.data, width: image.width, height: image.height };
}

function rasterToPng(raster: Raster, maxBytes: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new PortraitMatteError('تصویر قابل خواندن نیست.'));
  context.putImageData(new ImageData(raster.data, raster.width, raster.height), 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new PortraitMatteError('آماده‌سازی تصویر بدون پس‌زمینه انجام نشد.'));
        return;
      }
      if (blob.size > maxBytes) {
        reject(new PortraitMatteError('حجم فایل بیش از حد مجاز است.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

export async function removePersonalPhotoBackground(file: File, maxBytes: number): Promise<File> {
  const matted = applyPortraitMatte(await loadRaster(file));
  const blob = await rasterToPng(matted, maxBytes);
  const base = file.name.replace(/\.[^.]+$/, '') || 'personal-photo';
  return new File([blob], `${base}-cutout.png`, { type: 'image/png', lastModified: Date.now() });
}
