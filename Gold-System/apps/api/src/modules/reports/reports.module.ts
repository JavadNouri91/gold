import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ReportsRepository } from './infrastructure/repositories/reports.repository';
import { ReportsService } from './application/reports.service';
import { ReportsController } from './presentation/controllers/reports.controller';

/**
 * Reports Module
 *
 * Provides read-only aggregated reports across all business modules.
 * This module NEVER modifies any business data.
 *
 * Endpoints under GET /reports/*
 */
@Module({
  imports: [PrismaModule],
  providers: [ReportsRepository, ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
