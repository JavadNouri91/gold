import { Module } from '@nestjs/common';
import { SupplierController } from './presentation/controllers/supplier.controller';
import { SupplierService } from './application/supplier.service';
import { SupplierRepository } from './infrastructure/repositories/supplier.repository';
import { AuditModule } from '../audit/audit.module';

/**
 * Suppliers Module � Phase 6
 *
 * Implements Supplier (UpstreamProvider) + SupplierAccount management.
 * docs/09-domain-model.md � UpstreamProvider 1:1 SupplierAccount
 * docs/05-use-cases.md UC-13, UC-14
 *
 * MVP: Manual data entry only (docs/21-business-decisions.md �11.2)
 * Future: API adapter via SupplierIntegrationMode.API_FUTURE
 *
 * Supplier settlement: DEFERRED �8.4 � SupplierAccount scaffolded for future use.
 */
@Module({
  imports: [AuditModule],
  controllers: [SupplierController],
  providers: [SupplierService, SupplierRepository],
  exports: [SupplierService, SupplierRepository],
})
export class SuppliersModule {}
