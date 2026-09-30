import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CustomerAccountRepository } from '../infrastructure/repositories/customer-account.repository';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { BusinessRuleException } from '../../../common/exceptions/business-rule.exception';
import { CustomerAccountEntity } from '../domain/entities/customer-account.entity';
import { GrantCreditDto, CreditPool } from './dto/grant-credit.dto';
import Decimal from 'decimal.js';

export class CustomerAccountResponseDto {
  id: string;
  customerId: string;
  status: string;
  creditLimitRial: string;
  reservedCreditRial: string;
  consumedCreditRial: string;
  availableRial: string;
  creditLimitGoldRial: string;
  reservedCreditGoldRial: string;
  consumedCreditGoldRial: string;
  availableGoldRial: string;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(e: CustomerAccountEntity): CustomerAccountResponseDto {
    const dto = new CustomerAccountResponseDto();
    dto.id = e.id;
    dto.customerId = e.customerId;
    dto.status = e.status;
    dto.creditLimitRial = e.creditLimitRial.toFixed(2);
    dto.reservedCreditRial = e.reservedCreditRial.toFixed(2);
    dto.consumedCreditRial = e.consumedCreditRial.toFixed(2);
    dto.availableRial = e.availableRial.toFixed(2);
    dto.creditLimitGoldRial = e.creditLimitGoldRial.toFixed(2);
    dto.reservedCreditGoldRial = e.reservedCreditGoldRial.toFixed(2);
    dto.consumedCreditGoldRial = e.consumedCreditGoldRial.toFixed(2);
    dto.availableGoldRial = e.availableGoldRial.toFixed(2);
    dto.createdAt = e.createdAt;
    dto.updatedAt = e.updatedAt;
    return dto;
  }
}

@Injectable()
export class CustomerAccountsService {
  private readonly logger = new Logger(CustomerAccountsService.name);

  constructor(
    private readonly accountRepo: CustomerAccountRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Find account for a customer by customer ID (staff access).
   */
  async findByCustomerId(customerId: string): Promise<CustomerAccountResponseDto> {
    const account = await this.accountRepo.findByCustomerId(customerId);
    if (!account) {
      throw new NotFoundException(
        `Account for customer ${customerId} not found. KYC approval may be pending.`,
      );
    }
    return CustomerAccountResponseDto.fromEntity(account);
  }

  /**
   * Find account for the currently authenticated customer (by user ID).
   * Used by "GET /customers/me/account".
   */
  async findByUserId(userId: string): Promise<CustomerAccountResponseDto> {
    // Direct Prisma lookup for userId→customerId chain (avoids circular module dep)
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer profile not found for this user');
    }
    return this.findByCustomerId(customer.id);
  }

  /**
   * Own credit ledger. Scoped to the authenticated user's account.
   * Amounts stay decimal strings. This does not change balances.
   */
  async listMyTransactions(userId: string, limit = 20): Promise<CreditTransactionResponseDto[]> {
    const take = clampTransactionLimit(limit);
    const account = await this.findByUserId(userId);
    const rows = await this.accountRepo.listTransactionsByAccountId(account.id, take);
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      creditPool: row.creditPool,
      amount: row.amount.toFixed(2),
      balanceAfter: row.balanceAfter.toFixed(2),
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      reason: row.reason,
      createdAt: row.createdAt,
    }));
  }

  /**
   * UC-05: Grant credit to customer
   * BR-C04: actor and reason are mandatory
   */
  async grantCredit(
    customerId: string,
    dto: GrantCreditDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<CustomerAccountResponseDto> {
    const account = await this.accountRepo.findByCustomerId(customerId);
    if (!account) {
      throw new BusinessRuleException(
        'CUSTOMER_ACCOUNT_NOT_FOUND',
        `Customer ${customerId} does not have an account. KYC approval required first.`,
      );
    }

    if (!account.isActive()) {
      throw new BusinessRuleException(
        'CUSTOMER_ACCOUNT_INACTIVE',
        'Cannot grant credit to an inactive account',
      );
    }

    // Parse amount — kept as string from client to preserve Decimal precision
    let amount: Decimal;
    try {
      amount = new Decimal(dto.amount);
    } catch {
      throw new BusinessRuleException(
        'INVALID_CREDIT_AMOUNT',
        'Credit amount must be a valid numeric string',
      );
    }

    if (amount.lte(0)) {
      throw new BusinessRuleException(
        'INVALID_CREDIT_AMOUNT',
        'Credit amount must be greater than zero',
      );
    }

    const before =
      dto.pool === CreditPool.RIAL
        ? { creditLimitRial: account.creditLimitRial.toFixed(2) }
        : { creditLimitGoldRial: account.creditLimitGoldRial.toFixed(2) };

    const updated = await this.accountRepo.grantCredit({
      accountId: account.id,
      pool: dto.pool,
      amount,
      reason: dto.reason,
      actorId,
    });

    // BR-C04: audit with actor and reason
    await this.audit.log({
      actorId,
      action: 'CREDIT_GRANTED',
      entityType: 'CustomerAccount',
      entityId: account.id,
      before,
      after:
        dto.pool === CreditPool.RIAL
          ? { creditLimitRial: updated.creditLimitRial.toFixed(2) }
          : { creditLimitGoldRial: updated.creditLimitGoldRial.toFixed(2) },
      reason: dto.reason,
      ipAddress,
    });

    this.logger.log(
      `Credit granted: ${dto.pool} +${amount.toFixed(2)} for customer ${customerId} by ${actorId}`,
    );

    return CustomerAccountResponseDto.fromEntity(updated);
  }
}

export interface CreditTransactionResponseDto {
  id: string;
  type: string;
  creditPool: string;
  amount: string;
  balanceAfter: string;
  sourceType: string | null;
  sourceId: string | null;
  reason: string | null;
  createdAt: Date;
}

function clampTransactionLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(50, Math.max(1, Math.floor(limit)));
}
