import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { StorageService } from './storage.service';

describe('StorageService (local filesystem)', () => {
  let root: string;
  let service: StorageService;

  const configValue = (value: string | undefined) => ({
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'storage.localRoot' || key === 'STORAGE_LOCAL_ROOT') return value;
      if (key === 'storage.bucketDefault' || key === 'STORAGE_BUCKET') return undefined;
      if (key === 'storage.bucketKyc' || key === 'STORAGE_BUCKET_KYC') return 'gold-kyc-documents';
      if (key === 'storage.bucketQuotations' || key === 'STORAGE_BUCKET_QUOTATIONS') {
        return 'gold-quotations';
      }
      return undefined;
    }),
  });

  const makeService = (rootPath: string) =>
    new StorageService({ get: configValue(rootPath).get } as never);

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'gold-storage-'));
    service = makeService(root);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  describe('upload / getObject / exists / delete', () => {
    it('uploads, reads back the same bytes, reports existence, and deletes', async () => {
      const payload = Buffer.from('image-bytes');
      const stored = await service.upload({
        buffer: payload,
        originalName: 'id.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: payload.length,
        prefix: 'kyc-documents/cust-1',
        bucket: service.kycBucket,
      });

      expect(stored.key).toMatch(/^kyc-documents\/cust-1\/.+\.jpg$/);
      expect(stored.bucket).toBe('gold-kyc-documents');
      expect(stored.originalName).toBe('id.jpg');
      expect(stored.mimeType).toBe('image/jpeg');
      expect(stored.sizeBytes).toBe(payload.length);

      expect(await service.exists(stored.key, service.kycBucket)).toBe(true);
      expect((await service.getObject(stored.key, service.kycBucket)).equals(payload)).toBe(true);

      await service.delete(stored.key, service.kycBucket);
      expect(await service.exists(stored.key, service.kycBucket)).toBe(false);
    });

    it('maps mime types to extensions including json', async () => {
      const stored = await service.upload({
        buffer: Buffer.from('{}'),
        originalName: 'doc.json',
        mimeType: 'application/json',
        sizeBytes: 2,
        prefix: 'quotations/QT-1',
      });
      expect(stored.key).toMatch(/^quotations\/QT-1\/.+\.json$/);
    });

    it('isolates the default bucket from the KYC bucket', async () => {
      const kyc = await service.upload({
        buffer: Buffer.from('kyc'),
        originalName: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 3,
        prefix: 'kyc-documents/cust-1',
        bucket: service.kycBucket,
      });
      const def = await service.upload({
        buffer: Buffer.from('default'),
        originalName: 'b.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 7,
        prefix: 'customer-avatars/cust-1',
      });

      expect(await service.exists(kyc.key, service.kycBucket)).toBe(true);
      // The same relative key does not exist in the default bucket.
      expect(await service.exists(kyc.key)).toBe(false);
      expect(def.bucket).not.toBe(service.kycBucket);
    });

    it('reads a missing file as NotFoundException', async () => {
      await expect(service.getObject('missing/key.jpg', service.kycBucket)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('deletes idempotently (missing file is not an error)', async () => {
      await expect(service.delete('missing/key.jpg', service.kycBucket)).resolves.toBeUndefined();
    });

    it('returns false for missing objects', async () => {
      expect(await service.exists('missing/key.jpg', service.kycBucket)).toBe(false);
    });
  });

  describe('path validation', () => {
    const invalidKeys = [
      '../escape.jpg',
      'a/../../escape.jpg',
      'a\\..\\escape.jpg',
      '/absolute.jpg',
      '\\absolute.jpg',
      'C:/windows/system32/file.jpg',
      'C:\\windows\\file.jpg',
      '\\\\server\\share\\file.jpg',
      'a\u0000b.jpg',
      'a/./b.jpg',
      'a//b.jpg',
      'prefix/:colon.jpg',
    ];

    it.each(invalidKeys)('rejects traversal/absolute/null key %s', async (key) => {
      await expect(service.getObject(key, service.kycBucket)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.delete(key, service.kycBucket)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.exists(key, service.kycBucket)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a traversal prefix on upload', async () => {
      await expect(
        service.upload({
          buffer: Buffer.from('x'),
          originalName: 'x.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1,
          prefix: '../escape',
          bucket: service.kycBucket,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an invalid bucket name', async () => {
      await expect(service.getObject('key.jpg', '../bad')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.getObject('key.jpg', 'a/b')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does not leak resolved paths in validation errors', async () => {
      try {
        await service.getObject('../secret.jpg', service.kycBucket);
        fail('expected to throw');
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        expect(message).not.toContain(root);
        expect(message).not.toContain('secret');
      }
    });
  });

  describe('filesystem failures', () => {
    it('throws InternalServerErrorException when the key resolves to a directory', async () => {
      await fs.mkdir(join(root, service.kycBucket, 'adir.jpg'), { recursive: true });
      await expect(service.getObject('adir.jpg', service.kycBucket)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });

    it('throws InternalServerErrorException when the root cannot be written', async () => {
      // Point the root at an existing file so directory creation fails.
      const fileRoot = join(root, 'root-is-a-file');
      await fs.writeFile(fileRoot, 'not a directory');
      const failing = makeService(fileRoot);
      await expect(
        failing.upload({
          buffer: Buffer.from('x'),
          originalName: 'x.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1,
          prefix: 'p',
        }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });
});
