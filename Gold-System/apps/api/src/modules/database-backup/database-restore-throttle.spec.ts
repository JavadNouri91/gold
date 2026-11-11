import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseBackupController } from './presentation/database-backup.controller';
import { DatabaseBackupService } from './application/database-backup.service';
import { DatabaseRestoreService } from './application/database-restore.service';

const request = require('supertest');

describe('Emergency restore retry limits', () => {
  let app: INestApplication;
  const restore = jest.fn().mockResolvedValue({ restored: true });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: 'short', ttl: 1000, limit: 20 },
          { name: 'long', ttl: 60_000, limit: 200 },
        ]),
      ],
      controllers: [DatabaseBackupController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: DatabaseBackupService, useValue: {} },
        { provide: DatabaseRestoreService, useValue: { restore } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('allows a corrected submission after failed uploads, while excessive attempts get a localized wait time', async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      await request(app.getHttpServer())
        .post('/admin/database-backup/restore')
        .field('confirmation', 'RESTORE')
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/admin/database-backup/restore')
      .attach('file', Buffer.from('PGDMP-fixture'), 'backup.dump')
      .field('confirmation', 'RESTORE')
      .expect(200);
    expect(restore).toHaveBeenCalledTimes(1);

    // Rapid retries must remain bounded, even after allowing corrected uploads.
    let throttled;
    for (let attempt = 0; attempt < 11; attempt++) {
      const response = await request(app.getHttpServer()).post('/admin/database-backup/restore');
      if (response.status === 429) {
        throttled = response;
        break;
      }
    }
    expect(throttled?.status).toBe(429);
    expect(throttled?.body.error.message).toContain('ثانیه دیگر');
    expect(Number(throttled?.headers['retry-after'])).toBeGreaterThan(0);
    expect(restore).toHaveBeenCalledTimes(1);
  });
});
