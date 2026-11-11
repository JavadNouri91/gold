import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { spawn } from 'child_process';
import { createReadStream } from 'fs';
import { copyFile, mkdir, open } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { DatabaseBackupService } from './database-backup.service';

export const RESTORE_CONFIRMATION = 'RESTORE';

@Injectable()
export class DatabaseRestoreService {
  busy = false;
  activeRequests = 0;
  constructor(private readonly backup: DatabaseBackupService) {}

  async restore(filePath: string, confirmation: string) {
    if (confirmation !== RESTORE_CONFIRMATION)
      throw new BadRequestException('برای تأیید جایگزینی اطلاعات، عبارت RESTORE را وارد کنید.');
    if (this.busy) throw new ConflictException('یک بازیابی دیگر در حال انجام است.');
    this.busy = true;
    let recoveryFileName: string | undefined;
    try {
      const drainDeadline = Date.now() + 30_000;
      while (this.activeRequests > 1) {
        if (Date.now() >= drainDeadline)
          throw new ConflictException(
            'درخواست‌های قبلی هنوز تمام نشده‌اند. پس از توقف کار کاربران دوباره تلاش کنید.',
          );
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
      const file = await open(filePath, 'r');
      try {
        const magic = Buffer.alloc(5);
        await file.read(magic, 0, 5, 0);
        if (magic.toString() !== 'PGDMP')
          throw new BadRequestException('فقط فایل بک‌آپ PostgreSQL با قالب dump پذیرفته می‌شود.');
      } finally {
        await file.close();
      }
      const contents = await this.runRestore(filePath, true);
      if (
        !/TABLE public users\s/m.test(contents) ||
        !/TABLE public _prisma_migrations\s/m.test(contents)
      ) {
        throw new BadRequestException('فایل انتخاب‌شده ساختار پایه دیتابیس این سامانه را ندارد.');
      }

      // A durable safety copy must exist before pg_restore can modify any table.
      const snapshot = await this.backup.createBackup();
      try {
        const recoveryDirectory = resolve(
          process.env.DATABASE_BACKUP_RECOVERY_DIR || '.data/emergency-recovery',
        );
        await mkdir(recoveryDirectory, { recursive: true, mode: 0o700 });
        const name = `before-restore-${randomUUID()}.dump`;
        await copyFile(snapshot.filePath, join(recoveryDirectory, name));
        recoveryFileName = name;
      } finally {
        await snapshot.cleanup();
      }

      await this.runRestore(filePath, false);
      return {
        restored: true,
        recoveryFileName,
        message: 'بازیابی انجام شد. برای استفاده از اطلاعات بازیابی‌شده دوباره وارد سامانه شوید.',
      };
    } catch (error) {
      if (recoveryFileName) {
        throw new ServiceUnavailableException(
          `بازیابی کامل نشد. عملیات دیتابیس در یک تراکنش اجرا شد. نسخه پیش از بازیابی روی سرور نگه‌داری شده است: ${recoveryFileName}`,
        );
      }
      throw error;
    } finally {
      this.busy = false;
    }
  }

  private async runRestore(filePath: string, list: boolean): Promise<string> {
    const container = process.env.DATABASE_BACKUP_DOCKER_CONTAINER;
    const executable =
      process.env.PG_RESTORE_PATH ||
      (process.env.PG_DUMP_PATH
        ? join(
            dirname(process.env.PG_DUMP_PATH),
            process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore',
          )
        : 'pg_restore');
    const env = { ...process.env };
    const args = list
      ? ['--list']
      : [
          '--clean',
          '--if-exists',
          '--single-transaction',
          '--exit-on-error',
          '--no-owner',
          '--no-acl',
          '--no-password',
        ];
    if (!list) {
      const connection = new URL(process.env.DATABASE_URL!);
      const host =
        container && ['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname)
          ? 'host.docker.internal'
          : connection.hostname;
      args.push(
        `--host=${host}`,
        `--port=${connection.port || '5432'}`,
        `--username=${decodeURIComponent(connection.username)}`,
        `--dbname=${decodeURIComponent(connection.pathname.slice(1))}`,
      );
      env.PGPASSWORD = decodeURIComponent(connection.password);
      if (connection.searchParams.has('sslmode'))
        env.PGSSLMODE = connection.searchParams.get('sslmode')!;
      env.PGOPTIONS = '-c lock_timeout=15000 -c statement_timeout=600000';
    }
    const commandArgs = container
      ? [
          'exec',
          '-i',
          ...['PGPASSWORD', 'PGSSLMODE', 'PGOPTIONS']
            .filter((key) => env[key] !== undefined)
            .flatMap((key) => ['-e', key]),
          container,
          'timeout',
          '-s',
          'KILL',
          list ? '30' : '900',
          'pg_restore',
          ...args,
        ]
      : args;
    return new Promise((resolveResult, reject) => {
      const child = spawn(container ? 'docker' : executable, commandArgs, {
        env,
        windowsHide: true,
        shell: false,
      });
      let output = '';
      let failure = false;
      let timedOut = false;
      const input = createReadStream(filePath);
      input.on('error', () => {
        failure = true;
        child.kill();
      });
      child.stdin.on('error', () => {
        failure = true;
      });
      input.pipe(child.stdin);
      child.stdout.on('data', (chunk: Buffer) => {
        if (output.length + chunk.length > 4 * 1024 * 1024) {
          failure = true;
          child.kill();
        } else output += chunk.toString('utf8');
      });
      // Drain diagnostics, without returning archive SQL or credentials to the client.
      child.stderr.resume();
      const timer = setTimeout(
        () => {
          timedOut = true;
          child.kill('SIGKILL');
        },
        list ? 35_000 : 905_000,
      );
      child.once('error', () => {
        clearTimeout(timer);
        input.destroy();
        reject(new ServiceUnavailableException('ابزار pg_restore در سرور در دسترس نیست.'));
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        input.destroy();
        if (code === 0 && !failure && !timedOut) resolveResult(output);
        else
          reject(
            list
              ? new BadRequestException('فایل بک‌آپ خوانا نیست یا با نسخه PostgreSQL سازگار نیست.')
              : new ServiceUnavailableException('بازیابی دیتابیس ناموفق بود.'),
          );
      });
    });
  }
}
