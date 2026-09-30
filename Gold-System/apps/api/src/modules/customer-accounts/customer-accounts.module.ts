import { Module } from '@nestjs/common';
import { CustomerAccountsController } from './presentation/controllers/customer-accounts.controller';
import { CustomerAccountsService } from './application/customer-accounts.service';
import { CustomerAccountRepository } from './infrastructure/repositories/customer-account.repository';

@Module({
  controllers: [CustomerAccountsController],
  providers: [CustomerAccountsService, CustomerAccountRepository],
  exports: [CustomerAccountsService, CustomerAccountRepository],
})
export class CustomerAccountsModule {}
