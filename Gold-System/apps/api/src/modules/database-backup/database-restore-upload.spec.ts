import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { access, readFile } from 'fs/promises';
import { DatabaseBackupController } from './presentation/database-backup.controller';
import { DatabaseBackupService } from './application/database-backup.service';
import { DatabaseRestoreService } from './application/database-restore.service';

const request = require('supertest');

describe('Restore multipart upload', () => {
  let app: INestApplication;
  const restore = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DatabaseBackupController],
      providers: [
        { provide: DatabaseBackupService, useValue: {} },
        { provide: DatabaseRestoreService, useValue: { restore } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => restore.mockReset());
  afterAll(async () => {
    await app.close();
  });

  it.each(['file-first', 'confirmation-first'])(
    'accepts the browser form (%s) and removes the uploaded file',
    async (order) => {
      let uploadedPath = '';
      restore.mockImplementation(async (filePath: string, confirmation: string) => {
        uploadedPath = filePath;
        expect(confirmation).toBe('RESTORE');
        expect(await readFile(filePath, 'utf8')).toBe('PGDMP-fixture');
        return { restored: true };
      });
      const submission = request(app.getHttpServer()).post('/admin/database-backup/restore');
      if (order === 'confirmation-first') submission.field('confirmation', 'RESTORE');
      submission.attach('file', Buffer.from('PGDMP-fixture'), 'backup.dump');
      if (order === 'file-first') submission.field('confirmation', 'RESTORE');
      await submission.expect(200);
      expect(restore).toHaveBeenCalledTimes(1);
      await expect(access(uploadedPath)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('rejects an additional form field before invoking restore', async () => {
    await request(app.getHttpServer())
      .post('/admin/database-backup/restore')
      .attach('file', Buffer.from('PGDMP-fixture'), 'backup.dump')
      .field('confirmation', 'RESTORE')
      .field('extra', 'value')
      .expect(400);
    expect(restore).not.toHaveBeenCalled();
  });

  it('rejects a second file before invoking restore', async () => {
    await request(app.getHttpServer())
      .post('/admin/database-backup/restore')
      .attach('file', Buffer.from('PGDMP-fixture'), 'backup.dump')
      .attach('file', Buffer.from('PGDMP-fixture'), 'another.dump')
      .field('confirmation', 'RESTORE')
      .expect(400);
    expect(restore).not.toHaveBeenCalled();
  });
});
