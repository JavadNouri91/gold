import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { dirname, join, resolve, sep } from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface StoredFile {
  /** Object key — store in DB; never store raw file in DB */
  key: string;
  bucket: string;
  /** Original filename provided by uploader */
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  /** Logical folder prefix, e.g. "kyc-documents" */
  prefix: string;
  /** Override the default bucket. KYC files use the private KYC bucket. */
  bucket?: string;
}

/** Supported MIME types for KYC document uploads */
export const ALLOWED_KYC_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

/** Maximum KYC document size: 10 MB */
export const MAX_KYC_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const SAFE_BUCKET_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;
const WINDOWS_DRIVE_OR_UNC_RE = /^[A-Za-z]:[\\/]/;
const NULL_BYTE = '\u0000';

/**
 * Local filesystem storage.
 *
 * Logical bucket names are directory names under a single configured root, so
 * `${bucket}/${key}` reproduces the previous S3/MinIO object address and every
 * database key remains valid. Files are written atomically (temp file + rename)
 * and every key/bucket is validated against path traversal, absolute paths,
 * null bytes and escapes outside the configured root or bucket.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;
  private readonly bucket: string;
  private readonly kycBucketName: string;
  private readonly quotationsBucketName: string;

  constructor(private readonly config: ConfigService) {
    this.root = resolve(
      this.config.get<string>('storage.localRoot') ||
        this.config.get<string>('STORAGE_LOCAL_ROOT') ||
        join(process.cwd(), '.data', 'uploads'),
    );

    this.kycBucketName =
      this.config.get<string>('storage.bucketKyc') ||
      this.config.get<string>('STORAGE_BUCKET_KYC') ||
      'gold-kyc-documents';
    this.bucket =
      this.config.get<string>('storage.bucketDefault') ||
      this.config.get<string>('STORAGE_BUCKET') ||
      'gold-kyc';
    this.quotationsBucketName =
      this.config.get<string>('storage.bucketQuotations') ||
      this.config.get<string>('STORAGE_BUCKET_QUOTATIONS') ||
      'gold-quotations';
  }

  /** Private bucket configured for KYC document files. */
  get kycBucket(): string {
    return this.kycBucketName;
  }

  async onModuleInit(): Promise<void> {
    const names = new Set([this.kycBucketName, this.bucket, this.quotationsBucketName]);
    for (const name of names) {
      await this.ensureBucket(name);
    }
  }

  private async ensureBucket(name: string): Promise<void> {
    this.assertSafeBucket(name);
    const dir = join(this.root, name);
    try {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    } catch (err) {
      this.logger.error(`Could not create storage bucket directory ${name}`, err);
    }
  }

  /**
   * Upload a file to the private store.
   * Returns the stored file metadata (key, bucket, etc.).
   * Throws InternalServerErrorException on filesystem failure.
   */
  async upload(input: UploadInput): Promise<StoredFile> {
    const ext = this.extFromMime(input.mimeType);
    const key = `${input.prefix}/${uuidv4()}${ext}`;
    const bucket = input.bucket ?? this.bucket;

    const target = this.resolveKey(bucket, key);
    const tmpPath = `${target}.${uuidv4()}.tmp`;
    try {
      await this.ensureDir(dirname(target));
      await fs.writeFile(tmpPath, input.buffer, { flag: 'wx', mode: 0o600 });
      await fs.rename(tmpPath, target);
    } catch (err) {
      try {
        await fs.unlink(tmpPath).catch(() => undefined);
      } catch {
        /* best-effort cleanup */
      }
      this.logger.error(`Local upload failed for key ${key}`, err);
      throw new InternalServerErrorException('File upload failed');
    }

    return {
      key,
      bucket,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    };
  }

  /**
   * Delete an object from storage.
   * Use with caution — prefer soft-deletion at the DB layer.
   */
  async delete(key: string, bucket = this.bucket): Promise<void> {
    const target = this.resolveKey(bucket, key);
    try {
      await fs.unlink(target);
    } catch (err) {
      if (this.isMissingFile(err)) return; // idempotent
      this.logger.error(`Local delete failed for key ${key}`, err);
      throw new InternalServerErrorException('File deletion failed');
    }
  }

  /** Read a private object. Caller must audit access before returning it to a client. */
  async getObject(key: string, bucket = this.bucket): Promise<Buffer> {
    const target = this.resolveKey(bucket, key);
    try {
      return await fs.readFile(target);
    } catch (err) {
      if (this.isMissingFile(err)) {
        throw new NotFoundException('File not found');
      }
      this.logger.error(`Local read failed for key ${key}`, err);
      throw new InternalServerErrorException('File read failed');
    }
  }

  /** Check whether an object exists in storage */
  async exists(key: string, bucket = this.bucket): Promise<boolean> {
    const target = this.resolveKey(bucket, key);
    try {
      const stat = await fs.stat(target);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  // ─── Internal helpers ──────────────────────────────────────

  private assertSafeBucket(bucket: string): void {
    if (!SAFE_BUCKET_RE.test(bucket) || bucket === '.' || bucket === '..') {
      throw new BadRequestException('Invalid storage bucket');
    }
  }

  private assertSafeKey(key: string): void {
    if (typeof key !== 'string' || key.length === 0) {
      throw new BadRequestException('Invalid storage key');
    }
    if (key.includes(NULL_BYTE)) {
      throw new BadRequestException('Invalid storage key');
    }
    if (key.startsWith('/') || key.startsWith('\\')) {
      throw new BadRequestException('Invalid storage key');
    }
    if (WINDOWS_DRIVE_OR_UNC_RE.test(key)) {
      throw new BadRequestException('Invalid storage key');
    }
    if (key.includes(':')) {
      // Windows alternate-data-stream marker; also blocks drive letters.
      throw new BadRequestException('Invalid storage key');
    }
    const segments = key.split(/[\\/]/);
    for (const segment of segments) {
      if (segment === '' || segment === '.' || segment === '..') {
        throw new BadRequestException('Invalid storage key');
      }
    }
  }

  /** Validates bucket + key and returns the resolved absolute path, or throws. */
  private resolveKey(bucket: string, key: string): string {
    this.assertSafeBucket(bucket);
    this.assertSafeKey(key);
    const bucketRoot = resolve(this.root, bucket);
    const target = resolve(bucketRoot, key);
    if (target !== bucketRoot && !target.startsWith(bucketRoot + sep)) {
      throw new BadRequestException('Invalid storage key');
    }
    return target;
  }

  private async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  }

  private isMissingFile(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'ENOENT'
    );
  }

  private extFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
      'application/json': '.json',
    };
    return map[mime] ?? '';
  }
}
