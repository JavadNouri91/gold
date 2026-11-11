const assert = require('assert/strict');
const path = require('path');
const { createRequire } = require('module');
const { execFileSync } = require('child_process');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');
const root = path.resolve(__dirname, '../../..');
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'));

(async () => {
  await apiRequire('@nestjs/config').ConfigModule.forRoot({
    envFilePath: [path.join(root, 'apps/api/.env'), path.join(root, '.env')],
  });
  const source = new URL(process.env.DATABASE_URL);
  const database = 'gold_restore_check_' + randomUUID().replace(/-/g, '');
  assert.match(database, /^gold_restore_check_[a-f0-9]{32}$/);
  const username = decodeURIComponent(source.username);
  const container = process.env.DATABASE_BACKUP_DOCKER_CONTAINER;
  assert.equal(container, 'gold_postgres');
  const sql = (db, statement) =>
    execFileSync(
      'docker',
      [
        'exec',
        '-i',
        container,
        'psql',
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-At',
        '-U',
        username,
        '-d',
        db,
      ],
      { input: statement, encoding: 'utf8', windowsHide: true },
    ).trim();
  const recoveryDir = await fs.mkdtemp(path.join(root, '.data/restore-check-'));
  let fixture;
  sql('postgres', `CREATE DATABASE "${database}";`);
  try {
    source.pathname = '/' + database;
    process.env.DATABASE_URL = source.toString();
    process.env.DATABASE_BACKUP_RECOVERY_DIR = recoveryDir;
    const { DatabaseBackupService } = require(
      path.join(
        root,
        'apps/api/dist/modules/database-backup/application/database-backup.service.js',
      ),
    );
    const { DatabaseRestoreService } = require(
      path.join(
        root,
        'apps/api/dist/modules/database-backup/application/database-restore.service.js',
      ),
    );
    const backup = new DatabaseBackupService();
    const restore = new DatabaseRestoreService(backup);
    sql(
      database,
      "CREATE TABLE public.users(id integer PRIMARY KEY, name text); INSERT INTO public.users VALUES (1, 'original'); CREATE TABLE public._prisma_migrations(id text PRIMARY KEY); INSERT INTO public._prisma_migrations VALUES ('fixture');",
    );
    fixture = await backup.createBackup();
    sql(
      database,
      "UPDATE public.users SET name='changed'; INSERT INTO public.users VALUES (2,'extra');",
    );
    const result = await restore.restore(fixture.filePath, 'RESTORE');
    assert.equal(result.restored, true);
    assert.equal(sql(database, 'SELECT id, name FROM public.users ORDER BY id;'), '1|original');
    assert.ok((await fs.stat(path.join(recoveryDir, result.recoveryFileName))).size > 0);
    assert.equal(restore.busy, false);
    sql(
      database,
      "CREATE VIEW public.not_in_archive AS SELECT * FROM public.users; UPDATE public.users SET name='keep_on_failure';",
    );
    await assert.rejects(restore.restore(fixture.filePath, 'RESTORE'), /بازیابی کامل نشد/);
    assert.equal(sql(database, 'SELECT name FROM public.users WHERE id=1;'), 'keep_on_failure');
    assert.equal(sql(database, 'SELECT id FROM public._prisma_migrations;'), 'fixture');
    assert.equal(restore.busy, false);
    assert.equal((await fs.readdir(recoveryDir)).length, 2);
    console.log(
      'PASS: isolated database restore, safety snapshots, rollback on SQL error, and maintenance release. Live database was not restored.',
    );
  } finally {
    if (fixture) await fixture.cleanup();
    sql('postgres', `DROP DATABASE "${database}" WITH (FORCE);`);
    await fs.rm(recoveryDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
