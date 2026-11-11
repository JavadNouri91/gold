import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Logger,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  UseFilters,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdtempSync } from 'fs';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DatabaseRestoreService } from '../application/database-restore.service';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { DatabaseBackupService } from '../application/database-backup.service';
import { DatabaseBackupThrottleFilter } from './database-backup-throttle.filter';

const restoreUploads = mkdtempSync(join(tmpdir(), 'gold-restore-uploads-'));
// Leave room to correct upload/confirmation errors without a minute-long lockout.
const EMERGENCY_TOOL_THROTTLE = {
  short: { limit: 3, ttl: 1000 },
  long: { limit: 10, ttl: 60_000 },
};

@Controller({ path: 'admin/database-backup', version: '1' })
@UseFilters(DatabaseBackupThrottleFilter)
export class DatabaseBackupController {
  private readonly logger = new Logger(DatabaseBackupController.name);
  constructor(
    private readonly backup: DatabaseBackupService,
    private readonly restore: DatabaseRestoreService,
  ) {}

  @Post('restore')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @RequirePermissions('database.backup.restore')
  @Throttle(EMERGENCY_TOOL_THROTTLE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: restoreUploads }),
      // Busboy emits partsLimit upon reaching the limit, including a valid final part.
      // Allow the two required parts; files/fields still reject any extra input.
      limits: { fileSize: 256 * 1024 * 1024, files: 1, fields: 1, parts: 3, fieldSize: 50 },
    }),
  )
  async restoreDatabase(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('confirmation') confirmation: string,
  ) {
    if (!file) throw new BadRequestException('فایل بک‌آپ را انتخاب کنید.');
    try {
      return await this.restore.restore(file.path, confirmation);
    } finally {
      await rm(file.path, { force: true }).catch(() =>
        this.logger.warn('Unable to remove restore upload'),
      );
    }
  }

  @Get('download')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @Throttle(EMERGENCY_TOOL_THROTTLE)
  @RequirePermissions('database.backup.create')
  async download(@Res() response: Response): Promise<void> {
    const artifact = await this.backup.createBackup();
    if (response.destroyed) {
      await artifact.cleanup();
      return;
    }
    response.setHeader('Content-Type', 'application/vnd.postgresql.custom');
    response.setHeader('Content-Disposition', `attachment; filename="${artifact.fileName}"`);
    response.setHeader('Content-Length', artifact.fileSize);
    const stream = createReadStream(artifact.filePath);
    stream.once('error', () => {
      response.destroy();
    });
    stream.once('close', () => {
      void artifact.cleanup().catch(() => this.logger.warn('Unable to remove temporary backup'));
    });
    response.once('close', () => stream.destroy());
    stream.pipe(response);
  }
}
