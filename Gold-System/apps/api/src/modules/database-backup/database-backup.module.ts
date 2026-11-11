import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DatabaseRestoreService } from './application/database-restore.service';
import { DatabaseRestoreMiddleware } from './presentation/database-restore.middleware';
import { DatabaseBackupController } from './presentation/database-backup.controller';
import { DatabaseBackupService } from './application/database-backup.service';
import { BackupStorageService } from './application/backup-storage.service';
import { BackupStorageController } from './presentation/backup-storage.controller';

// Emergency utility: no other feature imports or depends on this module.
@Module({
  controllers: [DatabaseBackupController, BackupStorageController],
  providers: [DatabaseBackupService, DatabaseRestoreService, BackupStorageService],
})
export class DatabaseBackupModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(DatabaseRestoreMiddleware).forRoutes('*');
  }
}
