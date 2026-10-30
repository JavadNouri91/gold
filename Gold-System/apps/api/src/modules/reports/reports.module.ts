import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { KycModule } from '../kyc/kyc.module';
import { ReportsRepository } from './infrastructure/repositories/reports.repository';
import { ReportsService } from './application/reports.service';
import { ReportsController } from './presentation/controllers/reports.controller';

/**
 * Reports Module
 *
 * Provides read-only aggregated reports across all business modules.
 * This module NEVER modifies any business data.
 *
 * KycModule is imported so the dashboard KYC figure uses the same
 * "awaiting review" bucket as the sidebar badge and the KYC queue.
 *
 * Endpoints under GET /reports/*
 */
@Module({
  imports: [PrismaModule, KycModule],
  providers: [ReportsRepository, ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
