import {
  GatewayTimeoutException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import { mkdtemp, rm, stat } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export interface DatabaseBackupArtifact {
  filePath: string;
  fileName: string;
  fileSize: number;
  cleanup: () => Promise<void>;
}

@Injectable()
export class DatabaseBackupService {
  private readonly logger = new Logger(DatabaseBackupService.name);

  async createBackup(): Promise<DatabaseBackupArtifact> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new ServiceUnavailableException('نشانی اتصال پایگاه داده تنظیم نشده است.');
    }

    const pgDumpPath = process.env.PG_DUMP_PATH || 'pg_dump';
    // Explicit opt-in for a host API using the project's Docker database.
    const dockerContainer = process.env.DATABASE_BACKUP_DOCKER_CONTAINER;
    const directory = await mkdtemp(join(tmpdir(), 'gold-db-backup-'));
    const fileName = `gold-database-${new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z')}.dump`;
    const filePath = join(directory, fileName);
    let cleaned = false;
    const cleanup = async () => {
      if (cleaned) return;
      cleaned = true;
      await rm(directory, { recursive: true, force: true });
    };

    let connection: URL;
    try {
      connection = new URL(databaseUrl);
      if (!['postgres:', 'postgresql:'].includes(connection.protocol))
        throw new Error('Unsupported database protocol');
    } catch {
      await cleanup();
      throw new ServiceUnavailableException('نشانی اتصال پایگاه داده معتبر نیست.');
    }

    const args = ['--format=custom', '--no-owner', '--no-acl', '--no-password'];
    const hostname =
      dockerContainer && ['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname)
        ? 'host.docker.internal'
        : connection.hostname;
    if (hostname) args.push(`--host=${hostname}`);
    if (connection.port) args.push(`--port=${connection.port}`);
    if (connection.username) args.push(`--username=${decodeURIComponent(connection.username)}`);
    const databaseName = decodeURIComponent(connection.pathname.replace(/^\//, ''));
    if (databaseName) args.push(`--dbname=${databaseName}`);

    const env = { ...process.env };
    if (connection.password) env.PGPASSWORD = decodeURIComponent(connection.password);
    const sslMode = connection.searchParams.get('sslmode');
    if (sslMode) env.PGSSLMODE = sslMode;
    connection.searchParams.forEach((value, key) => {
      if (key.startsWith('options')) env.PGOPTIONS = value;
      else if (key === 'application_name') env.PGAPPNAME = value;
    });
    const command = dockerContainer ? 'docker' : pgDumpPath;
    const commandArgs = dockerContainer
      ? [
          'exec',
          ...['PGPASSWORD', 'PGSSLMODE', 'PGOPTIONS', 'PGAPPNAME']
            .filter((key) => env[key] !== undefined)
            .flatMap((key) => ['-e', key]),
          dockerContainer,
          'pg_dump',
          ...args,
        ]
      : args;

    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(command, commandArgs, {
          env,
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        // Write bytes directly: never pass a binary archive through a shell.
        const output = pipeline(child.stdout, createWriteStream(filePath, { mode: 0o600 }));
        output.catch((error) => {
          child.kill('SIGTERM');
          reject(error);
        });
        let stderr = '';
        let timedOut = false;
        const timeout = setTimeout(
          () => {
            timedOut = true;
            child.kill('SIGTERM');
            setTimeout(() => child.kill('SIGKILL'), 5000).unref();
          },
          10 * 60 * 1000,
        );
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => {
          stderr = (stderr + chunk).slice(-4000);
        });
        child.once('error', reject);
        child.once('close', (code) => {
          clearTimeout(timeout);
          if (timedOut)
            reject(new GatewayTimeoutException('گرفتن نسخه پشتیبان بیش از زمان مجاز طول کشید.'));
          else if (code !== 0)
            reject(new ServiceUnavailableException('ساخت نسخه پشتیبان ناموفق بود.'));
          else output.then(() => resolve(), reject);
        });
        child.once('close', (code) => {
          if (code !== 0 && stderr) this.logger.warn(`pg_dump exited with code ${code}: ${stderr}`);
        });
      });
      const result = await stat(filePath);
      if (result.size === 0) throw new Error('pg_dump produced an empty backup');
      return { filePath, fileName, fileSize: result.size, cleanup };
    } catch (error) {
      await cleanup();
      if (error instanceof GatewayTimeoutException || error instanceof ServiceUnavailableException)
        throw error;
      this.logger.error(
        `Unable to start pg_dump: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new ServiceUnavailableException('ابزار pg_dump در سرور در دسترس نیست.');
    }
  }
}
