import { Module } from '@nestjs/common';
import { KycController } from './presentation/controllers/kyc.controller';
import { KycService } from './application/kyc.service';
import { KycVerificationRepository } from './infrastructure/repositories/kyc-verification.repository';
import { CustomerDocumentRepository } from './infrastructure/repositories/customer-document.repository';
import { CustomersModule } from '../customers/customers.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CustomersModule, NotificationsModule],
  controllers: [KycController],
  providers: [KycService, KycVerificationRepository, CustomerDocumentRepository],
  exports: [KycService],
})
export class KycModule {}
