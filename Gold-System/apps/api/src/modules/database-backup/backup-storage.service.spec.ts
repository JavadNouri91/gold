import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { Readable } from 'stream';
import { createHash } from 'crypto';
import { BackupStorageService } from './application/backup-storage.service';
import { DatabaseBackupService } from './application/database-backup.service';
import { S3Client } from '@aws-sdk/client-s3';

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  ...jest.requireActual('@aws-sdk/client-s3'),
  S3Client: jest.fn(() => ({ send: mockSend, destroy: jest.fn() })),
}));

describe('Emergency backup S3 storage', () => {
  let directory: string;
  let service: BackupStorageService;
  const backup = { createBackup: jest.fn() };
  const env = {
    directory: process.env.DATABASE_BACKUP_STORAGE_DIR,
    key: process.env.SETTINGS_ENCRYPTION_KEY,
  };
  const input = {
    enabled: true,
    endpoint: 'https://storage.example.com',
    region: 'us-east-1',
    bucket: 'test-backups',
    prefix: 'emergency/',
    forcePathStyle: true,
    allowHttp: false,
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret',
  };
  beforeEach(async () => {
    jest.clearAllMocks();
    directory = await mkdtemp(join(tmpdir(), 'gold-storage-test-'));
    process.env.DATABASE_BACKUP_STORAGE_DIR = directory;
    process.env.SETTINGS_ENCRYPTION_KEY = 'test-only-encryption-key-32-characters';
    service = new BackupStorageService(backup as unknown as DatabaseBackupService);
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
    if (env.directory === undefined) delete process.env.DATABASE_BACKUP_STORAGE_DIR;
    else process.env.DATABASE_BACKUP_STORAGE_DIR = env.directory;
    if (env.key === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY;
    else process.env.SETTINGS_ENCRYPTION_KEY = env.key;
  });
  it('encrypts settings and never returns either credential to the browser', async () => {
    const view = await service.save(input);
    expect(view).toMatchObject({ configured: true, hasCredentials: true, bucket: input.bucket });
    expect(JSON.stringify(view)).not.toContain('test-access');
    expect(JSON.stringify(view)).not.toContain('test-secret');
    const stored = await readFile(join(directory, 's3-settings.enc'), 'utf8');
    expect(stored).not.toContain('test-secret');
    expect(stored).not.toContain(input.endpoint);
  });
  it('preserves blank credentials but requires re-entry when moving endpoints', async () => {
    await service.save(input);
    await service.save({ ...input, accessKeyId: '', secretAccessKey: '' });
    mockSend.mockResolvedValue({ Contents: [] });
    await service.list();
    expect(S3Client).toHaveBeenLastCalledWith(
      expect.objectContaining({
        credentials: { accessKeyId: 'test-access', secretAccessKey: 'test-secret' },
      }),
    );
    await expect(
      service.save({
        ...input,
        endpoint: 'https://other.example.com',
        accessKeyId: '',
        secretAccessKey: '',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect((await service.view()).endpoint).toBe(input.endpoint);
  });
  it('rejects unsafe settings and unapproved HTTP', async () => {
    for (const override of [
      { endpoint: 'file:///tmp/store' },
      { endpoint: 'http://localhost:9000' },
      { prefix: '../private' },
      { bucket: '' },
    ]) {
      await expect(service.save({ ...input, ...override })).rejects.toMatchObject({ status: 400 });
    }
  });
  it('rejects keys outside the configured backup prefix before network access', async () => {
    await service.save(input);
    await expect(service.download('private/secrets.dump')).rejects.toMatchObject({ status: 400 });
    await expect(service.download('emergency/../secrets.dump')).rejects.toMatchObject({
      status: 400,
    });
    expect(mockSend).not.toHaveBeenCalled();
  });
  it('verifies an uploaded object and removes the local temporary backup', async () => {
    await service.save(input);
    const bytes = Buffer.from('PGDMP-test-data');
    const filePath = join(directory, 'fixture.dump');
    await writeFile(filePath, bytes);
    const cleanup = jest.fn();
    backup.createBackup.mockResolvedValue({
      filePath,
      fileSize: bytes.length,
      fileName: 'fixture.dump',
      cleanup,
    });
    const digest = createHash('sha256').update(bytes).digest('hex');
    mockSend.mockImplementation(async (command) => {
      if (command.input.Body) {
        const received = [];
        for await (const chunk of command.input.Body) received.push(chunk);
        expect(Buffer.concat(received)).toEqual(bytes);
        expect(command.input.Key).toMatch(/^emergency\/fixture-.+\.dump$/);
        expect(command.input.ContentMD5).toBe(createHash('md5').update(bytes).digest('base64'));
        return {};
      }
      return { ContentLength: bytes.length, Metadata: { sha256: digest } };
    });
    expect(await service.createAndUpload()).toMatchObject({ size: bytes.length, sha256: digest });
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
  it('does not report a corrupted remote download as successful', async () => {
    await service.save(input);
    mockSend.mockResolvedValue({
      Body: Readable.from(Buffer.from('bad')),
      ContentLength: 3,
      Metadata: { sha256: 'incorrect' },
    });
    await expect(service.download('emergency/file.dump')).rejects.toMatchObject({ status: 503 });
  });
});
