import { Injectable, Logger, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

export interface StoredFile {
  /** S3 object key — store in DB; never store raw file in DB */
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

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly kycBucketName: string;
  private readonly quotationsBucketName: string;
  private readonly signedUrlTtlSeconds: number;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('STORAGE_ENDPOINT');
    const region = this.config.get<string>('STORAGE_REGION', 'us-east-1');
    const accessKeyId = this.config.get<string>('STORAGE_ACCESS_KEY', '');
    const secretAccessKey = this.config.get<string>('STORAGE_SECRET_KEY', '');

    this.kycBucketName =
      this.config.get<string>('storage.bucketKyc') ||
      this.config.get<string>('STORAGE_BUCKET_KYC') ||
      'gold-kyc-documents';
    this.bucket = this.config.get<string>('STORAGE_BUCKET', 'gold-kyc');
    this.quotationsBucketName =
      this.config.get<string>('storage.bucketQuotations') ||
      this.config.get<string>('STORAGE_BUCKET_QUOTATIONS') ||
      'gold-quotations';
    this.signedUrlTtlSeconds = this.config.get<number>('STORAGE_SIGNED_URL_TTL_SECONDS', 3600);

    this.client = new S3Client({
      endpoint: endpoint || undefined,
      region,
      credentials: { accessKeyId, secretAccessKey },
      // Required for MinIO path-style addressing
      forcePathStyle: !!endpoint,
    });
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
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: name }));
    } catch (error) {
      const status =
        typeof error === 'object' && error && '$metadata' in error
          ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
          : undefined;
      const code = error instanceof Error ? error.name : '';
      if (status !== 404 && code !== 'NotFound' && code !== 'NoSuchBucket') {
        this.logger.warn(`Storage bucket ${name} could not be checked`);
        return;
      }
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: name }));
        this.logger.log(`Created private storage bucket ${name}`);
      } catch (createError) {
        this.logger.error(`Could not create storage bucket ${name}`, createError);
      }
    }
  }

  /**
   * Upload a file to the private bucket.
   * Returns the stored file metadata (key, bucket, etc.).
   * Throws InternalServerErrorException on S3 failure.
   */
  async upload(input: UploadInput): Promise<StoredFile> {
    const ext = this.extFromMime(input.mimeType);
    const key = `${input.prefix}/${uuidv4()}${ext}`;
    const bucket = input.bucket ?? this.bucket;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: input.buffer,
          ContentType: input.mimeType,
          ContentLength: input.sizeBytes,
          // No ACL — bucket is private; access is via signed URLs only
          Metadata: {
            originalName: encodeURIComponent(input.originalName),
          },
        }),
      );
    } catch (err) {
      this.logger.error(`S3 upload failed for key ${key}`, err);
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
   * Generate a pre-signed URL for a private object.
   * TTL is controlled by STORAGE_SIGNED_URL_TTL_SECONDS env var.
   * Every call to this method MUST be audited by the caller (§7.3).
   */
  async getSignedUrl(key: string, bucket = this.bucket): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      return await getSignedUrl(this.client, command, {
        expiresIn: this.signedUrlTtlSeconds,
      });
    } catch (err) {
      this.logger.error(`Failed to generate signed URL for key ${key}`, err);
      throw new InternalServerErrorException('Failed to generate document URL');
    }
  }

  /**
   * Delete an object from storage.
   * Use with caution — prefer soft-deletion at the DB layer.
   */
  async delete(key: string, bucket = this.bucket): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err) {
      this.logger.error(`S3 delete failed for key ${key}`, err);
      throw new InternalServerErrorException('File deletion failed');
    }
  }

  /** Read a private object. Caller must audit access before returning it to a client. */
  async getObject(key: string, bucket = this.bucket): Promise<Buffer> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes) {
        throw new InternalServerErrorException('File read failed');
      }
      return Buffer.from(bytes);
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      this.logger.error(`S3 read failed for key ${key}`, err);
      throw new InternalServerErrorException('File read failed');
    }
  }

  /** Check whether an object exists in storage */
  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  private extFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
    };
    return map[mime] ?? '';
  }
}
