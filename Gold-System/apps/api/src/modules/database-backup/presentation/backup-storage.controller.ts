import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Logger,
  Post,
  Put,
  Query,
  Res,
  UseFilters,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createReadStream } from 'fs';
import { Response } from 'express';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { BackupStorageService } from '../application/backup-storage.service';
import { UpdateBackupStorageDto } from '../application/backup-storage.dto';
import { DatabaseBackupThrottleFilter } from './database-backup-throttle.filter';

@Controller({ path: 'admin/database-backup/storage', version: '1' })
@UseFilters(DatabaseBackupThrottleFilter)
export class BackupStorageController {
  private readonly logger = new Logger(BackupStorageController.name);
  constructor(private readonly storage: BackupStorageService) {}

  @Get('settings')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('database.backup.create')
  view() {
    return this.storage.view();
  }

  @Put('settings')
  @RequirePermissions('database.backup.storage.manage')
  save(@Body() input: UpdateBackupStorageDto) {
    return this.storage.save(input);
  }

  @Post('test')
  @HttpCode(200)
  @RequirePermissions('database.backup.storage.manage')
  @Throttle({ short: { limit: 3, ttl: 1000 }, long: { limit: 10, ttl: 60_000 } })
  test() {
    return this.storage.testConnection();
  }

  @Get('objects')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('database.backup.create')
  list(@Query('cursor') cursor?: string) {
    return this.storage.list(cursor);
  }

  @Post('backups')
  @HttpCode(200)
  @RequirePermissions('database.backup.create')
  @Throttle({ short: { limit: 3, ttl: 1000 }, long: { limit: 10, ttl: 60_000 } })
  create() {
    return this.storage.createAndUpload();
  }

  @Get('download')
  @RequirePermissions('database.backup.create')
  @Header('Cache-Control', 'no-store, private')
  async download(@Query('key') key: string, @Res() response: Response) {
    const artifact = await this.storage.download(key);
    if (response.destroyed) {
      await artifact.cleanup();
      return;
    }
    response.setHeader('Content-Type', 'application/vnd.postgresql.custom');
    response.setHeader('Content-Disposition', `attachment; filename="${artifact.fileName}"`);
    response.setHeader('Content-Length', artifact.fileSize);
    const stream = createReadStream(artifact.filePath);
    stream.once('error', () => response.destroy());
    stream.once('close', () => {
      void artifact
        .cleanup()
        .catch(() => this.logger.warn('Unable to remove temporary S3 download'));
    });
    response.once('close', () => stream.destroy());
    stream.pipe(response);
  }
}
