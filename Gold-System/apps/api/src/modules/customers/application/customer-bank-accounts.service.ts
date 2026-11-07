import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { CustomerRepository } from '../infrastructure/repositories/customer.repository';
import { NotificationService } from '../../notifications/application/notification.service';
import { ibanBankCode, ibanBankName, isValidIranianIban, normalizeIban } from '../../../common/iban-bank';

export type OwnBankAccountDto = {
  id: string;
  iban: string;
  bankCode: string | null;
  bankName: string | null;
  accountHolder: string;
  status: string;
  isDefault: boolean;
  cardLast4: string | null;
  accountLast4: string | null;
  createdAt: string;
};

@Injectable()
export class CustomerBankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerRepo: CustomerRepository,
    private readonly audit: AuditService,
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  async listMine(userId: string): Promise<OwnBankAccountDto[]> {
    const customer = await this.requireCustomer(userId);
    const rows = await this.prisma.customerBankAccount.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async createMine(userId: string, input: string | { iban: string; bankName?: string; cardNumber?: string; accountNumber?: string }, ipAddress?: string): Promise<OwnBankAccountDto> {
    const customer = await this.requireCustomer(userId);
    const details = typeof input === 'string' ? { iban: input } : input;
    const iban = normalizeIban(details.iban);
    if (!isValidIranianIban(iban)) {
      throw new BadRequestException('شماره شبا باید با IR و ۲۴ رقم باشد');
    }
    const card = details.cardNumber?.replace(/\D/g, '') ?? '';
    if (card && (!/^\d{16}$/.test(card) || !this.validLuhn(card))) throw new BadRequestException('Invalid card number');

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
        bankName: (details.bankName?.trim() || ibanBankName(iban) || null),
        accountHolder,
        cardLast4: card ? card.slice(-4) : null,
        accountLast4: details.accountNumber?.replace(/\D/g, '').slice(-4) || null,
        status: 'PENDING',
      },
    });

    await this.audit.log({
      actorId: userId,
      action: 'BANK_ACCOUNT_CREATED',
      entityType: 'CustomerBankAccount',
      entityId: row.id,
      reason: `IBAN ending ${iban.slice(-4)}; pending review`,
      ipAddress,
    });

    await this.notifications?.sendConfiguredSmsEvent('account.bank_account_changed', `${row.id}:CREATED`, customer.userId ?? null,
      { action: 'ثبت شد', eventDate: new Date().toLocaleDateString('fa-IR') });

    return this.toDto(row);
  }

  async review(id: string, status: 'VERIFIED' | 'REJECTED', reviewerId: string, ipAddress?: string) {
    const row = await this.prisma.customerBankAccount.findUnique({ where: { id }, include: { customer: true } });
    if (!row) throw new NotFoundException('Bank account not found');
    if (status === 'VERIFIED' && row.customer.status !== 'APPROVED') throw new BadRequestException('Customer KYC must be approved before bank ownership review');
    const updated = await this.prisma.customerBankAccount.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId: reviewerId, action: `BANK_ACCOUNT_${status}`, entityType: 'CustomerBankAccount', entityId: id, reason: `IBAN ending ${row.iban.slice(-4)}`, ipAddress });
    await this.notifications?.sendConfiguredSmsEvent('account.bank_account_changed', `${row.id}:${status}`, row.customer.userId ?? null,
      { action: status === 'VERIFIED' ? 'تأیید شد' : 'رد شد', eventDate: new Date().toLocaleDateString('fa-IR') });
    return this.toDto(updated);
  }

  async setDefault(userId: string, id: string) {
    const customer = await this.requireCustomer(userId);
    const row = await this.prisma.customerBankAccount.findFirst({ where: { id, customerId: customer.id, status: 'VERIFIED' } });
    if (!row) throw new NotFoundException('Verified bank account not found');
    await this.prisma.$transaction([
      this.prisma.customerBankAccount.updateMany({ where: { customerId: customer.id }, data: { isDefault: false } }),
      this.prisma.customerBankAccount.update({ where: { id }, data: { isDefault: true } }),
    ]);
  }

  private validLuhn(value: string) {
    let sum = 0; let double = false;
    for (let i = value.length - 1; i >= 0; i--) { let digit = Number(value[i]); if (double && (digit *= 2) > 9) digit -= 9; sum += digit; double = !double; }
    return sum % 10 === 0;
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
      reason: `IBAN ending ${row.iban.slice(-4)}`,
      ipAddress,
    });
    if (this.notifications?.sendConfiguredSmsEvent && typeof this.customerRepo.findById === 'function') {
      const owner = await this.customerRepo.findById(row.customerId).catch(() => null);
      await this.notifications.sendConfiguredSmsEvent('account.bank_account_changed', `${row.id}:DELETED`, owner?.userId ?? null,
        { action: 'حذف شد', eventDate: new Date().toLocaleDateString('fa-IR') });
    }
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
    isDefault?: boolean;
    cardLast4?: string | null;
    accountLast4?: string | null;
    createdAt: Date;
  }): OwnBankAccountDto {
    return {
      id: row.id,
      iban: `IR${row.iban.slice(2, 7)}${'•'.repeat(15)}${row.iban.slice(-4)}`,
      bankCode: row.bankCode,
      bankName: row.bankName,
      accountHolder: row.accountHolder,
      status: row.status,
      isDefault: row.isDefault ?? false,
      cardLast4: row.cardLast4 ?? null,
      accountLast4: row.accountLast4 ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
