import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { CustomerRepository } from '../infrastructure/repositories/customer.repository';
import { CustomerBankAccountsService } from './customer-bank-accounts.service';
import { CustomerEntity } from '../domain/entities/customer.entity';
import { CustomerStatus } from '@gold/shared-types';

function makeCustomer() {
  return new CustomerEntity({
    id: 'cust-1',
    customerNumber: 'CUST-000001',
    userId: 'user-1',
    firstName: 'علی',
    lastName: 'محمدی',
    nationalId: '0012345678',
    mobile: '09123456789',
    email: null,
    dateOfBirth: null,
    address: null,
    type: null,
    status: CustomerStatus.ACTIVE,
    rejectionReason: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  });
}

describe('CustomerBankAccountsService', () => {
  const customerRepo = { findByUserId: jest.fn() };
  const audit = { log: jest.fn() };
  const prisma = {
    customerBankAccount: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };

  let service: CustomerBankAccountsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    customerRepo.findByUserId.mockResolvedValue(makeCustomer());
    const module = await Test.createTestingModule({
      providers: [
        CustomerBankAccountsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CustomerRepository, useValue: customerRepo },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(CustomerBankAccountsService);
  });

  it('lists own bank accounts', async () => {
    prisma.customerBankAccount.findMany.mockResolvedValue([
      {
        id: 'ba-1',
        iban: 'IR120560084200001234567890',
        bankCode: '056',
        bankName: 'بانک سامان',
        accountHolder: 'علی محمدی',
        status: 'VERIFIED',
        createdAt: new Date('2026-10-20'),
      },
    ]);

    await expect(service.listMine('user-1')).resolves.toEqual([
      {
        id: 'ba-1',
        iban: 'IR120560084200001234567890',
        bankCode: '056',
        bankName: 'بانک سامان',
        accountHolder: 'علی محمدی',
        status: 'VERIFIED',
        createdAt: '2026-10-20T00:00:00.000Z',
      },
    ]);
  });

  it('creates a normalized IBAN with bank metadata from the code table', async () => {
    prisma.customerBankAccount.findUnique.mockResolvedValue(null);
    prisma.customerBankAccount.create.mockResolvedValue({
      id: 'ba-2',
      iban: 'IR120560084200001234567890',
      bankCode: '056',
      bankName: 'بانک سامان',
      accountHolder: 'علی محمدی',
      status: 'VERIFIED',
      createdAt: new Date('2026-10-20'),
    });

    const created = await service.createMine('user-1', 'ir۱۲ 0560 0842 0000 1234 5678 90');
    expect(created.iban).toBe('IR120560084200001234567890');
    expect(created.bankCode).toBe('056');
    expect(created.bankName).toBe('بانک سامان');
    expect(prisma.customerBankAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 'cust-1',
        iban: 'IR120560084200001234567890',
        bankCode: '056',
        bankName: 'بانک سامان',
        accountHolder: 'علی محمدی',
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'BANK_ACCOUNT_CREATED' }));
  });

  it('rejects an invalid IBAN', async () => {
    await expect(service.createMine('user-1', 'IR12')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a duplicate IBAN', async () => {
    prisma.customerBankAccount.findUnique.mockResolvedValue({ id: 'ba-1' });
    await expect(service.createMine('user-1', 'IR120560084200001234567890')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('deletes only the signed-in customer account', async () => {
    prisma.customerBankAccount.findFirst.mockResolvedValue({
      id: 'ba-1',
      iban: 'IR120560084200001234567890',
    });
    prisma.customerBankAccount.delete.mockResolvedValue({});

    await service.deleteMine('user-1', 'ba-1');
    expect(prisma.customerBankAccount.delete).toHaveBeenCalledWith({ where: { id: 'ba-1' } });
  });

  it('does not delete another customer bank account', async () => {
    prisma.customerBankAccount.findFirst.mockResolvedValue(null);
    await expect(service.deleteMine('user-1', 'ba-other')).rejects.toBeInstanceOf(NotFoundException);
  });
});
