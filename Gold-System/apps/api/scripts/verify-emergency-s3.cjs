const assert = require('assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { execFileSync } = require('child_process');
const {
  S3Client,
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteBucketCommand,
} = require('@aws-sdk/client-s3');
const {
  BackupStorageService,
} = require('../dist/modules/database-backup/application/backup-storage.service');

(async () => {
  // Read only this local test service's credentials; never print or persist them outside the temporary test directory.
  const inspected = JSON.parse(
    execFileSync('docker', ['inspect', 'gold_minio'], { encoding: 'utf8', windowsHide: true }),
  )[0];
  const env = Object.fromEntries(
    inspected.Config.Env.map((value) => {
      const split = value.indexOf('=');
      return [value.slice(0, split), value.slice(split + 1)];
    }),
  );
  const accessKeyId = env.MINIO_ROOT_USER || env.MINIO_ACCESS_KEY;
  const secretAccessKey = env.MINIO_ROOT_PASSWORD || env.MINIO_SECRET_KEY;
  assert.ok(accessKeyId && secretAccessKey, 'Local MinIO credentials missing');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gold-s3-integration-'));
  process.env.DATABASE_BACKUP_STORAGE_DIR = directory;
  process.env.SETTINGS_ENCRYPTION_KEY = randomUUID() + randomUUID();
  const bucket = `gold-backup-check-${randomUUID()}`;
  const endpoint = 'http://localhost:9000';
  const client = new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  let uploadedKey;
  let created = false;
  let downloaded;
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    created = true;
    const bytes = Buffer.from('PGDMP synthetic storage verification; no customer data');
    const filePath = path.join(directory, 'fixture.dump');
    await fs.writeFile(filePath, bytes);
    let cleaned = false;
    const storage = new BackupStorageService({
      createBackup: async () => ({
        filePath,
        fileName: 'fixture.dump',
        fileSize: bytes.length,
        cleanup: async () => {
          cleaned = true;
        },
      }),
    });
    const settings = await storage.save({
      enabled: true,
      endpoint,
      region: 'us-east-1',
      bucket,
      prefix: 'checks/',
      allowHttp: true,
      forcePathStyle: true,
      accessKeyId,
      secretAccessKey,
    });
    assert.equal(settings.hasCredentials, true);
    assert.ok(!JSON.stringify(settings).includes(secretAccessKey));
    await storage.testConnection();
    const result = await storage.createAndUpload();
    uploadedKey = result.key;
    assert.equal(cleaned, true);
    assert.equal((await storage.list()).items[0].key, uploadedKey);
    downloaded = await storage.download(uploadedKey);
    assert.deepEqual(await fs.readFile(downloaded.filePath), bytes);
    console.log(
      'PASS: encrypted settings, MinIO connectivity, upload verification, listing, download checksum and byte equality. Only synthetic data used.',
    );
  } finally {
    if (downloaded) await downloaded.cleanup();
    if (uploadedKey)
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: uploadedKey }));
    if (created) await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    client.destroy();
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.name + ': S3 integration verification failed');
  process.exitCode = 1;
});
