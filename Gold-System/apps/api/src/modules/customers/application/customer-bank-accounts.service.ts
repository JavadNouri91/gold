import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { CustomerRepository } from '../infrastructure/repositories/customer.repository';
import { ibanBankCode, ibanBankName, isValidIranianIban, normalizeIban } from '../../../common/iban-bank';

export type OwnBankAccountDto = {
  id: string;
  iban: string;
  bankCode: string | null;
  bankName: string | null;
  accountHolder: string;
  status: string;
  createdAt: string;
};

@Injectable()
export class CustomerBankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerRepo: CustomerRepository,
    private readonly audit: AuditService,
  ) {}

  async listMine(userId: string): Promise<OwnBankAccountDto[]> {
    const customer = await this.requireCustomer(userId);
    const rows = await this.prisma.customerBankAccount.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async createMine(userId: string, rawIban: string, ipAddress?: string): Promise<OwnBankAccountDto> {
    const customer = await this.requireCustomer(userId);
    const iban = normalizeIban(rawIban);
    if (!isValidIranianIban(iban)) {
      throw new BadRequestException('شماره شبا باید با IR و ۲۴ رقم باشد');
    }

    const duplicate = await this.prisma.customerBankAccount.findUnique({
      where: { customerId_iban: { customerId: customer.id, iban } },
    });
    if (duplicate) {
      throw new ConflictException('این شماره شبا قبلاً ثبت شده است');
    }

    const accountHolder = `${customer.firstName} ${customer.lastName}`.trim();
    const row = await this.prisma.customerBankAccount.create({
      data: {
        customerId: customer.id,
        iban,
        bankCode: ibanBankCode(iban),
        bankName: ibanBankName(iban),
        accountHolder,
        status: 'VERIFIED',
      },
    });

    await this.audit.log({
      actorId: userId,
      action: 'BANK_ACCOUNT_CREATED',
      entityType: 'CustomerBankAccount',
      entityId: row.id,
      reason: iban,
      ipAddress,
    });

    return this.toDto(row);
  }

  async deleteMine(userId: string, id: string, ipAddress?: string): Promise<void> {
    const customer = await this.requireCustomer(userId);
    const row = await this.prisma.customerBankAccount.findFirst({
      where: { id, customerId: customer.id },
    });
    if (!row) {
      throw new NotFoundException('حساب بانکی پیدا نشد');
    }

    await this.prisma.customerBankAccount.delete({ where: { id: row.id } });

    await this.audit.log({
      actorId: userId,
      action: 'BANK_ACCOUNT_DELETED',
      entityType: 'CustomerBankAccount',
      entityId: row.id,
      reason: row.iban,
      ipAddress,
    });
  }

  private async requireCustomer(userId: string) {
    const customer = await this.customerRepo.findByUserId(userId);
    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }
    return customer;
  }

  private toDto(row: {
    id: string;
    iban: string;
    bankCode: string | null;
    bankName: string | null;
    accountHolder: string;
    status: string;
    createdAt: Date;
  }): OwnBankAccountDto {
    return {
      id: row.id,
      iban: row.iban,
      bankCode: row.bankCode,
      bankName: row.bankName,
      accountHolder: row.accountHolder,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
