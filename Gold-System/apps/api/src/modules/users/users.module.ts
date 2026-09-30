import { Module } from '@nestjs/common';
import { UsersService } from './application/users.service';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { UsersController } from './presentation/controllers/users.controller';

@Module({
  providers: [UsersService, UserRepository],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
