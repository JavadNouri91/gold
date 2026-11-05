import { BadRequestException } from '@nestjs/common';
import { CustomerDirectoryService } from './customer-directory.service';
import { requiredKycTypes } from '../../kyc/domain/kyc-workflow';

describe('customer account activation', () => {
  const prisma = {
    customer: { findUnique: jest.fn(), update: jest.fn() },
    customerDocument: { findMany: jest.fn() },
  };
  const audit = { log: jest.fn() };
  const service = Object.assign(Object.create(CustomerDirectoryService.prototype), { prisma, audit });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'cust-15', status: 'APPROVED', accountStatus: 'INACTIVE', type: null,
    });
    prisma.customer.update.mockResolvedValue({ id: 'cust-15', accountStatus: 'ACTIVE' });
  });

  it('rejects activation before KYC approval', async () => {
    prisma.customer.findUnique.mockResolvedValue({
      id: 'cust-15', status: 'PENDING', accountStatus: 'INACTIVE', type: null,
    });
    await expect(service.setAccountStatus('cust-15', { accountStatus: 'ACTIVE' }, 'staff'))
      .rejects.toThrow(BadRequestException);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('rejects activation when required documents are missing', async () => {
    prisma.customerDocument.findMany.mockResolvedValue([]);
    await expect(service.setAccountStatus('cust-15', { accountStatus: 'ACTIVE' }, 'staff'))
      .rejects.toThrow(BadRequestException);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('allows activation after all required documents are approved', async () => {
    prisma.customerDocument.findMany.mockResolvedValue(
      requiredKycTypes(null).map(({ type }) => ({ documentType: type, status: 'APPROVED' })),
    );
    await expect(service.setAccountStatus('cust-15', { accountStatus: 'ACTIVE' }, 'staff'))
      .resolves.toEqual({ id: 'cust-15', accountStatus: 'ACTIVE' });
  });
});
