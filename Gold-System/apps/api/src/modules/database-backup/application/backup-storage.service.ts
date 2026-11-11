import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { Readable, Transform } from 'stream';
import { finished, pipeline } from 'stream/promises';
import { decryptSecret, encryptSecret } from '../../../common/crypto/secret-box';
import { DatabaseBackupArtifact, DatabaseBackupService } from './database-backup.service';
import { UpdateBackupStorageDto } from './backup-storage.dto';

interface StorageSettings extends UpdateBackupStorageDto {
  accessKeyId: string;
  secretAccessKey: string;
}
const MAX_OBJECT_BYTES = 5 * 1024 ** 3;
const DEFAULTS = {
  enabled: false,
  endpoint: '',
  region: 'us-east-1',
  bucket: '',
  prefix: 'emergency-backups/',
  forcePathStyle: true,
  allowHttp: false,
};

@Injectable()
export class BackupStorageService {
  private writing = false;
  constructor(private readonly backup: DatabaseBackupService) {}
  private get directory() {
    return resolve(process.env.DATABASE_BACKUP_STORAGE_DIR || '.data/emergency-storage');
  }

  private async load(): Promise<StorageSettings | null> {
    try {
      return JSON.parse(
        decryptSecret(await readFile(join(this.directory, 's3-settings.enc'), 'utf8')),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new ServiceUnavailableException(
        'خواندن تنظیمات ذخیره‌سازی ممکن نیست. کلید رمزگذاری سرور را بررسی کنید.',
      );
    }
  }

  async view() {
    const config = await this.load();
    if (!config) return { ...DEFAULTS, configured: false, hasCredentials: false };
    const { accessKeyId: _key, secretAccessKey: _secret, ...safe } = config;
    return {
      ...safe,
      configured: true,
      hasCredentials: !!config.accessKeyId && !!config.secretAccessKey,
    };
  }

  async save(input: UpdateBackupStorageDto) {
    const previous = await this.load();
    let endpoint: URL;
    try {
      endpoint = new URL(input.endpoint.trim());
    } catch {
      throw new BadRequestException('نشانی Endpoint معتبر نیست.');
    }
    if (
      !['https:', 'http:'].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      !['', '/'].includes(endpoint.pathname)
    ) {
      throw new BadRequestException(
        'Endpoint باید نشانی اصلی سرویس S3 و بدون نام باکت، رمز یا پارامتر باشد.',
      );
    }
    if (endpoint.protocol === 'http:' && !input.allowHttp)
      throw new BadRequestException(
        'برای اتصال HTTP باید استفاده از اتصال بدون TLS را تأیید کنید.',
      );
    const bucket = input.bucket.trim();
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket))
      throw new BadRequestException('نام باکت معتبر نیست.');
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(input.region.trim()))
      throw new BadRequestException('Region معتبر نیست.');
    const prefix = input.prefix.trim().replace(/^\/+|\/+$/g, '');
    if (
      !prefix ||
      !/^[a-zA-Z0-9._/-]+$/.test(prefix) ||
      prefix.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw new BadRequestException('یک پوشه اختصاصی معتبر برای بک‌آپ مشخص کنید.');
    const endpointValue = endpoint.origin;
    if (
      previous &&
      previous.endpoint !== endpointValue &&
      (!input.accessKeyId?.trim() || !input.secretAccessKey?.trim())
    ) {
      throw new BadRequestException('با تغییر Endpoint، کلید دسترسی و رمز را دوباره وارد کنید.');
    }
    if (
      previous &&
      input.accessKeyId?.trim() &&
      input.accessKeyId.trim() !== previous.accessKeyId &&
      !input.secretAccessKey?.trim()
    ) {
      throw new BadRequestException('برای کلید دسترسی جدید، رمز جدید را هم وارد کنید.');
    }
    const config: StorageSettings = {
      enabled: input.enabled,
      endpoint: endpointValue,
      region: input.region.trim(),
      bucket,
      prefix: `${prefix}/`,
      forcePathStyle: input.forcePathStyle,
      allowHttp: input.allowHttp,
      accessKeyId: input.accessKeyId?.trim() || previous?.accessKeyId || '',
      secretAccessKey: input.secretAccessKey?.trim() || previous?.secretAccessKey || '',
    };
    if (!config.accessKeyId || !config.secretAccessKey)
      throw new BadRequestException('کلید دسترسی و رمز را وارد کنید.');
    let encrypted: string;
    try {
      encrypted = encryptSecret(JSON.stringify(config));
    } catch {
      throw new ServiceUnavailableException('کلید رمزگذاری تنظیمات روی سرور تنظیم نشده است.');
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = join(this.directory, `${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, encrypted, { mode: 0o600, flag: 'wx' });
      await rename(temporary, join(this.directory, 's3-settings.enc'));
    } finally {
      await rm(temporary, { force: true });
    }
    return this.view();
  }

  private async configured() {
    const config = await this.load();
    if (!config?.enabled) throw new BadRequestException('ابتدا مقصد S3 را تنظیم و فعال کنید.');
    return config;
  }
  private client(config: StorageSettings) {
    return new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 1,
    });
  }
  private remoteError() {
    return new ServiceUnavailableException(
      'ارتباط با فضای S3 ناموفق بود. نشانی سرویس، نام باکت و مجوز کلیدها را بررسی کنید.',
    );
  }

  async list(cursor?: string) {
    if (cursor && (typeof cursor !== 'string' || cursor.length > 4096))
      throw new BadRequestException('نشانگر صفحه معتبر نیست.');
    const config = await this.configured();
    const client = this.client(config);
    try {
      const result = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: config.prefix,
          MaxKeys: 50,
          ContinuationToken: cursor,
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      return {
        items: (result.Contents || [])
          .filter(
            (item) =>
              item.Key?.startsWith(config.prefix) &&
              item.Key.endsWith('.dump') &&
              !item.Key.slice(config.prefix.length).includes('/'),
          )
          .map((item) => ({
            key: item.Key!,
            size: item.Size || 0,
            lastModified: item.LastModified?.toISOString() || null,
          }))
          .sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || '')),
        nextCursor: result.NextContinuationToken || null,
      };
    } catch {
      throw this.remoteError();
    } finally {
      client.destroy();
    }
  }

  async testConnection() {
    await this.list();
    return { message: 'اتصال و خواندن مسیر تأیید شد. مجوز نوشتن هنگام ذخیره بک‌آپ بررسی می‌شود.' };
  }

  async createAndUpload() {
    const config = await this.configured();
    if (this.writing) throw new ConflictException('یک بک‌آپ دیگر در حال ارسال به S3 است.');
    this.writing = true;
    let artifact: DatabaseBackupArtifact | undefined;
    try {
      artifact = await this.backup.createBackup();
      return await this.uploadArtifact(config, artifact);
    } finally {
      this.writing = false;
      await artifact?.cleanup();
    }
  }

  private async uploadArtifact(config: StorageSettings, artifact: DatabaseBackupArtifact) {
    if (artifact.fileSize > MAX_OBJECT_BYTES)
      throw new BadRequestException('ذخیره یک فایل تا حداکثر ۵ گیگابایت پشتیبانی می‌شود.');
    const md5 = createHash('md5');
    const sha256 = createHash('sha256');
    for await (const chunk of createReadStream(artifact.filePath)) {
      md5.update(chunk);
      sha256.update(chunk);
    }
    const digest = sha256.digest('hex');
    const key = `${config.prefix}${artifact.fileName.replace(/\.dump$/, '')}-${randomUUID()}.dump`;
    const client = this.client(config);
    const body = createReadStream(artifact.filePath);
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentLength: artifact.fileSize,
          ContentType: 'application/vnd.postgresql.custom',
          ContentMD5: md5.digest('base64'),
          Metadata: { sha256: digest },
        }),
        { abortSignal: AbortSignal.timeout(15 * 60_000) },
      );
      const saved = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(30_000),
      });
      if (saved.ContentLength !== artifact.fileSize || saved.Metadata?.sha256 !== digest)
        throw new Error('Upload verification failed');
      return { key, size: artifact.fileSize, sha256: digest, bucket: config.bucket };
    } catch {
      throw new ServiceUnavailableException(
        'ذخیره و تأیید فایل روی S3 کامل نشد. پیش از تلاش دوباره فهرست فایل‌ها را به‌روز کنید و مجوزهای خواندن و نوشتن را بررسی کنید.',
      );
    } finally {
      body.destroy();
      await finished(body).catch(() => undefined);
      client.destroy();
    }
  }

  async download(key: string): Promise<DatabaseBackupArtifact> {
    const config = await this.configured();
    if (
      typeof key !== 'string' ||
      key.length > 1024 ||
      !key.startsWith(config.prefix) ||
      !key.endsWith('.dump') ||
      key.slice(config.prefix.length).includes('/') ||
      key.includes('\\') ||
      key.includes('\0')
    )
      throw new BadRequestException('فایل انتخاب‌شده در مسیر بک‌آپ نیست.');
    const directory = await mkdtemp(join(tmpdir(), 'gold-s3-backup-'));
    const filePath = join(directory, 'backup.dump');
    const cleanup = () => rm(directory, { recursive: true, force: true });
    const client = this.client(config);
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(15 * 60_000),
      });
      const body = result.Body as Readable;
      if (!body || (result.ContentLength || 0) > MAX_OBJECT_BYTES) {
        body?.destroy();
        throw new Error('Invalid size');
      }
      let size = 0;
      const sha256 = createHash('sha256');
      await pipeline(
        body,
        new Transform({
          transform(chunk, _encoding, done) {
            size += chunk.length;
            if (size > MAX_OBJECT_BYTES) return done(new Error('Too large'));
            sha256.update(chunk);
            done(null, chunk);
          },
        }),
        createWriteStream(filePath, { mode: 0o600 }),
        { signal: AbortSignal.timeout(15 * 60_000) },
      );
      if (result.ContentLength !== undefined && result.ContentLength !== size)
        throw new Error('Truncated backup');
      if (result.Metadata?.sha256 && sha256.digest('hex') !== result.Metadata.sha256)
        throw new Error('Checksum mismatch');
      return {
        filePath,
        fileName: 'gold-s3-backup.dump',
        fileSize: (await stat(filePath)).size,
        cleanup,
      };
    } catch {
      await cleanup();
      throw this.remoteError();
    } finally {
      client.destroy();
    }
  }
}
