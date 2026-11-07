import { CustomersModule } from '../customers/customers.module';
import { AuthSecurityService } from './application/auth-security.service';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './application/auth.service';
import { AuthController } from './presentation/controllers/auth.controller';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
import { OtpRepository } from './infrastructure/repositories/otp.repository';
import { RefreshTokenRepository } from './infrastructure/repositories/refresh-token.repository';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
        signOptions: { expiresIn: config.get<string>('jwt.accessExpiresIn', '15m') },
      }),
    }),
    UsersModule,
    CustomersModule,
    AuditModule,
    NotificationsModule,
    SessionsModule,
    SmsModule,
  ],
  providers: [AuthSecurityService, AuthService, JwtStrategy, OtpRepository, RefreshTokenRepository],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
