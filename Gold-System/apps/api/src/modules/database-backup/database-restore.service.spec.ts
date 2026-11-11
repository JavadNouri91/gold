import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { DatabaseBackupService } from './application/database-backup.service';
import { DatabaseRestoreService } from './application/database-restore.service';
import { DatabaseRestoreMiddleware } from './presentation/database-restore.middleware';

describe('Emergency restore interlocks', () => {
  const backup = { createBackup: jest.fn() };
  let service: DatabaseRestoreService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new DatabaseRestoreService(backup as unknown as DatabaseBackupService);
  });

  it('rejects missing explicit confirmation before opening a file or touching the database', async () => {
    await expect(service.restore('nonexistent.dump', '')).rejects.toMatchObject({ status: 400 });
    expect(backup.createBackup).not.toHaveBeenCalled();
    expect(service.busy).toBe(false);
  });

  it('rejects a concurrent restore without releasing the first restore lock', async () => {
    service.busy = true;
    await expect(service.restore('nonexistent.dump', 'RESTORE')).rejects.toMatchObject({
      status: 409,
    });
    expect(service.busy).toBe(true);
    expect(backup.createBackup).not.toHaveBeenCalled();
  });

  it('rejects a renamed SQL file and reopens the application after validation fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gold-restore-test-'));
    try {
      const file = join(directory, 'fake.dump');
      await writeFile(file, 'DROP DATABASE gold_db;');
      await expect(service.restore(file, 'RESTORE')).rejects.toMatchObject({ status: 400 });
      expect(backup.createBackup).not.toHaveBeenCalled();
      expect(service.busy).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('blocks new API requests before authentication/database queries during restore', () => {
    service.busy = true;
    const response = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    new DatabaseRestoreMiddleware(service).use({} as never, response as never, next);
    expect(response.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });
});
