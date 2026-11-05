import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';

const KEY = 'approved-customer-kyc';
export const RequireApprovedKyc = () => SetMetadata(KEY, true);

@Injectable()
export class ApprovedKycGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (!this.reflector.getAllAndOverride<boolean>(KEY, [context.getHandler(), context.getClass()]))
      return true;
    const req = context.switchToHttp().getRequest<{ user?: { userId: string } }>();
    const customer =
      req.user &&
      (await this.prisma.customer.findUnique({
        where: { userId: req.user.userId },
        include: { kycVerifications: { orderBy: { createdAt: 'desc' }, take: 1 } },
      }));
    if (customer?.status === 'ACTIVE' && customer.accountStatus === 'ACTIVE') return true;
    const pending =
      customer?.status === 'UNDER_REVIEW' ||
      ['PENDING', 'UNDER_REVIEW'].includes(customer?.kycVerifications[0]?.status ?? '');
    throw new ForbiddenException({
      code: 'KYC_REQUIRED',
      message: pending
        ? 'مدارک شما در انتظار تأیید است.'
        : 'برای استفاده از این امکان، ابتدا احراز هویت خود را تکمیل کنید.',
      details: { action: 'تکمیل احراز هویت', href: '/portal/profile#kyc', pending },
    });
  }
}
