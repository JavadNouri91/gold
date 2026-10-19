import { Module } from '@nestjs/common';
import { CustomersController } from './presentation/controllers/customers.controller';
import { CustomersService } from './application/customers.service';
import { CustomerDirectoryService } from './application/customer-directory.service';
import { CustomerRepository } from './infrastructure/repositories/customer.repository';
import { UsersModule } from '../users/users.module';
import { CustomerAccountsModule } from '../customer-accounts/customer-accounts.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [UsersModule, CustomerAccountsModule, NotificationsModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerDirectoryService, CustomerRepository],
  exports: [CustomersService, CustomerRepository],
})
export class CustomersModule {}
