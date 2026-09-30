import { BadRequestException } from '@nestjs/common';

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

const IMAGE_SIGNATURES: Record<string, (buffer: Buffer) => boolean> = {
  'image/jpeg': (buffer) =>
    buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/png': (buffer) =>
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (buffer) =>
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP',
};

export type ReceiptMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export function assertReceiptFile(file: {
  mimetype: string;
  size: number;
  buffer: Buffer;
}): ReceiptMime {
  if (!file.buffer?.length) {
    throw new BadRequestException('فایل رسید انتخاب نشده است.');
  }
  if (file.size > MAX_RECEIPT_BYTES || file.buffer.length > MAX_RECEIPT_BYTES) {
    throw new BadRequestException('حجم رسید نباید بیشتر از ۱۰ مگابایت باشد.');
  }
  if (file.mimetype === 'application/pdf') {
    if (file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException('فقط تصویر JPG، PNG، WebP یا PDF پذیرفته می‌شود.');
    }
    return 'application/pdf';
  }
  const matches = IMAGE_SIGNATURES[file.mimetype];
  if (!matches || !matches(file.buffer)) {
    throw new BadRequestException('فقط تصویر JPG، PNG، WebP یا PDF پذیرفته می‌شود.');
  }
  return file.mimetype as ReceiptMime;
}
