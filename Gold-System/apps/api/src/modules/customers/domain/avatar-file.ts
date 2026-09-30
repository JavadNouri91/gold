import { BadRequestException } from '@nestjs/common';

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const SIGNATURES = {
  'image/jpeg': (buffer: Buffer) =>
    buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/png': (buffer: Buffer) =>
    buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (buffer: Buffer) =>
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP',
} as const;

export type AvatarMime = keyof typeof SIGNATURES;

export function assertAvatarFile(file: { mimetype: string; size: number; buffer: Buffer }): AvatarMime {
  if (!file.buffer?.length) {
    throw new BadRequestException('لطفاً یک تصویر انتخاب کنید.');
  }
  if (file.size > MAX_AVATAR_BYTES || file.buffer.length > MAX_AVATAR_BYTES) {
    throw new BadRequestException('حجم تصویر نباید بیشتر از ۲ مگابایت باشد.');
  }
  const mime = file.mimetype as AvatarMime;
  const matches = SIGNATURES[mime];
  if (!matches || !matches(file.buffer)) {
    throw new BadRequestException('فقط تصویر JPG، PNG یا WebP پذیرفته می‌شود.');
  }
  return mime;
}

export function mimeFromAvatarKey(key: string): AvatarMime {
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}
