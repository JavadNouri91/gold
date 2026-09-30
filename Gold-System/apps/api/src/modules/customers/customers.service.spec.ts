import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BusinessRuleException } from '../../common/exceptions/business-rule.exception';
import { StorageService } from '../../common/storage/storage.service';
import { CustomersService } from './application/customers.service';
import { CustomerRepository } from './infrastructure/repositories/customer.repository';
import { CustomerAccountRepository } from '../customer-accounts/infrastructure/repositories/customer-account.repository';
import { UsersService } from '../users/application/users.service';
import { AuditService } from '../audit/application/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { CustomerEntity } from './domain/entities/customer.entity';
import { CustomerStatus, CustomerType } from '@gold/shared-types';

// ─── Helper factory ────────────────────────────────────────────
function makeCustomer(
  overrides: Partial<ConstructorParameters<typeof CustomerEntity>[0]> = {},
): CustomerEntity {
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
    status: CustomerStatus.PENDING,
    rejectionReason: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

// ─── Mocks ─────────────────────────────────────────────────────
const mockCustomerRepo = {
  findByMobile: jest.fn(),
  findByNationalId: jest.fn(),
  findById: jest.fn(),
  findByUserId: jest.fn(),
  list: jest.fn(),
  nextCustomerNumber: jest.fn(),
  updateStatus: jest.fn(),
  updateType: jest.fn(),
  updateAccountStatus: jest.fn(),
  findByEmail: jest.fn(),
  updateAvatarKey: jest.fn(),
};

const mockStorage = {
  upload: jest.fn(),
  delete: jest.fn(),
  getObject: jest.fn(),
};

const mockAccountRepo = {
  createForCustomer: jest.fn(),
  findByCustomerId: jest.fn(),
};

const mockUsersService = {
  findByMobile: jest.fn(),
  createCustomerUser: jest.fn(),
};

const mockAudit = {
  log: jest.fn(),
};

const mockPrisma = {
  role: { findUnique: jest.fn() },
  customer: { create: jest.fn() },
  user: { findUnique: jest.fn() },
  order: { count: jest.fn() },
  trade: { count: jest.fn() },
  payment: { count: jest.fn() },
  customerAccount: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};

// ─── Test suite ────────────────────────────────────────────────
describe('CustomersService', () => {
  let service: CustomersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: CustomerRepository, useValue: mockCustomerRepo },
        { provide: CustomerAccountRepository, useValue: mockAccountRepo },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AuditService, useValue: mockAudit },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  // ── register ────────────────────────────────────────────────
  describe('register', () => {
    const dto = {
      firstName: 'علی',
      lastName: 'محمدی',
      nationalId: '0012345678',
      mobile: '09123456789',
      password: 'SecurePass123!',
    };

    it('throws ConflictException when mobile already exists', async () => {
      mockCustomerRepo.findByMobile.mockResolvedValue(makeCustomer());

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(mockCustomerRepo.findByMobile).toHaveBeenCalledWith(dto.mobile);
    });

    it('throws ConflictException when nationalId already exists', async () => {
      mockCustomerRepo.findByMobile.mockResolvedValue(null);
      mockCustomerRepo.findByNationalId.mockResolvedValue(makeCustomer());

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when User mobile already exists', async () => {
      mockCustomerRepo.findByMobile.mockResolvedValue(null);
      mockCustomerRepo.findByNationalId.mockResolvedValue(null);
      mockUsersService.findByMobile.mockResolvedValue({ id: 'user-other' });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it('creates customer and audits when inputs are valid', async () => {
      mockCustomerRepo.findByMobile.mockResolvedValue(null);
      mockCustomerRepo.findByNationalId.mockResolvedValue(null);
      mockUsersService.findByMobile.mockResolvedValue(null);

      mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-customer' });

      const createdRow = {
        id: 'cust-1',
        customerNumber: 'CUST-000001',
        userId: 'user-1',
        mobile: dto.mobile,
        nationalId: dto.nationalId,
        status: 'PENDING',
      };

      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: {
            create: jest
              .fn()
              .mockResolvedValue({ id: 'user-1', name: 'علی محمدی', mobile: dto.mobile }),
          },
          customer: {
            create: jest.fn().mockResolvedValue(createdRow),
            count: jest.fn().mockResolvedValue(0),
          },
        };
        // nextCustomerNumber uses tx.customer.count
        mockCustomerRepo.nextCustomerNumber.mockResolvedValue('CUST-000001');
        mockUsersService.createCustomerUser.mockResolvedValue({
          id: 'user-1',
          name: 'علی محمدی',
          mobile: dto.mobile,
        });
        return fn(tx);
      });

      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());

      const result = await service.register(dto);

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CUSTOMER_REGISTERED' }),
      );
      expect(result.customerNumber).toBe('CUST-000001');
    });
  });

  // ── findById ────────────────────────────────────────────────
  describe('findById', () => {
    it('throws NotFoundException for unknown id', async () => {
      mockCustomerRepo.findById.mockResolvedValue(null);
      await expect(service.findById('unknown')).rejects.toThrow(NotFoundException);
    });

    it('returns CustomerResponseDto for known id', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      const result = await service.findById('cust-1');
      expect(result.id).toBe('cust-1');
      expect(result.fullName).toBe('علی محمدی');
    });
  });

  // ── assignType (UC-04) ──────────────────────────────────────
  describe('assignType', () => {
    const dto = { type: CustomerType.HOUSEHOLD, reason: 'Customer verified as household' };

    it('throws BusinessRuleException when customer is PENDING (not APPROVED/ACTIVE)', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer({ status: CustomerStatus.PENDING }));

      await expect(service.assignType('cust-1', dto, 'staff-1')).rejects.toMatchObject({
        message: expect.stringContaining('APPROVED or ACTIVE'),
      });
    });

    it('assigns type and audits when customer is APPROVED', async () => {
      const approvedCustomer = makeCustomer({ status: CustomerStatus.APPROVED });
      mockCustomerRepo.findById.mockResolvedValue(approvedCustomer);
      mockCustomerRepo.updateType.mockResolvedValue(
        makeCustomer({ status: CustomerStatus.APPROVED, type: CustomerType.HOUSEHOLD }),
      );
      mockCustomerRepo.updateStatus.mockResolvedValue(
        makeCustomer({ status: CustomerStatus.ACTIVE, type: CustomerType.HOUSEHOLD }),
      );

      await service.assignType('cust-1', dto, 'staff-1');

      // BR-C03: type change must be audited
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CUSTOMER_TYPE_ASSIGNED' }),
      );
    });

    it('activates customer after type assignment when status was APPROVED', async () => {
      const approvedCustomer = makeCustomer({ status: CustomerStatus.APPROVED });
      mockCustomerRepo.findById.mockResolvedValue(approvedCustomer);
      mockCustomerRepo.updateType.mockResolvedValue(
        makeCustomer({ status: CustomerStatus.APPROVED, type: CustomerType.HOUSEHOLD }),
      );
      mockCustomerRepo.updateStatus.mockResolvedValue(
        makeCustomer({ status: CustomerStatus.ACTIVE, type: CustomerType.HOUSEHOLD }),
      );

      const result = await service.assignType('cust-1', dto, 'staff-1');

      expect(result.status).toBe(CustomerStatus.ACTIVE);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CUSTOMER_ACTIVATED' }),
      );
    });
  });

  // ── markUnderReview ─────────────────────────────────────────
  describe('markUnderReview', () => {
    it('throws when customer is not PENDING', async () => {
      mockCustomerRepo.findById.mockResolvedValue(
        makeCustomer({ status: CustomerStatus.UNDER_REVIEW }),
      );

      await expect(service.markUnderReview('cust-1', 'reviewer-1')).rejects.toMatchObject({
        message: expect.stringContaining('UNDER_REVIEW'),
      });
    });

    it('transitions PENDING customer to UNDER_REVIEW', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockCustomerRepo.updateStatus.mockResolvedValue(
        makeCustomer({ status: CustomerStatus.UNDER_REVIEW }),
      );

      const result = await service.markUnderReview('cust-1', 'reviewer-1');

      expect(result.status).toBe(CustomerStatus.UNDER_REVIEW);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CUSTOMER_REVIEW_STARTED' }),
      );
    });
  });

  // ── approve / reject ─────────────────────────────────────────
  describe('approve', () => {
    it('creates CustomerAccount on approval', async () => {
      mockCustomerRepo.findById.mockResolvedValue(
        makeCustomer({ status: CustomerStatus.UNDER_REVIEW }),
      );
      mockCustomerRepo.updateStatus.mockResolvedValue(
        makeCustomer({ status: CustomerStatus.APPROVED }),
      );
      mockAccountRepo.createForCustomer.mockResolvedValue({ id: 'acct-1' });

      await service.approve('cust-1', 'reviewer-1');

      expect(mockAccountRepo.createForCustomer).toHaveBeenCalledWith('cust-1');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CUSTOMER_ACCOUNT_CREATED' }),
      );
    });
  });

  describe('reject', () => {
    it('audits rejection with reason', async () => {
      mockCustomerRepo.findById.mockResolvedValue(
        makeCustomer({ status: CustomerStatus.UNDER_REVIEW }),
      );
      mockCustomerRepo.updateStatus.mockResolvedValue(
        makeCustomer({ status: CustomerStatus.REJECTED, rejectionReason: 'Blurry ID' }),
      );

      await service.reject('cust-1', 'Blurry ID', 'reviewer-1');

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CUSTOMER_REJECTED',
          reason: 'Blurry ID',
        }),
      );
    });
  });

  describe('updateOwnProfile', () => {
    it('updates contact fields and audits the change', async () => {
      mockCustomerRepo.findByUserId.mockResolvedValue(makeCustomer());
      mockCustomerRepo.findByEmail.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          customer: { update: jest.fn() },
          user: { update: jest.fn() },
        }),
      );

      const result = await service.updateOwnProfile('user-1', {
        email: 'ali@example.com',
        address: 'تهران',
        postalCode: '1234567890',
      });

      expect(result.customerNumber).toBe('CUST-000001');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CUSTOMER_CONTACT_UPDATED', entityId: 'cust-1' }),
      );
    });

    it('rejects an email that belongs to another customer', async () => {
      mockCustomerRepo.findByUserId.mockResolvedValue(makeCustomer());
      mockCustomerRepo.findByEmail.mockResolvedValue(makeCustomer({ id: 'cust-2' }));

      await expect(
        service.updateOwnProfile('user-1', { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('uploadOwnAvatar', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

    it('stores the photo for the signed-in customer and does not keep the storage key in the response', async () => {
      mockCustomerRepo.findByUserId.mockResolvedValue(
        makeCustomer({ avatarKey: 'customer-avatars/cust-1/a.jpg' }),
      );
      mockCustomerRepo.updateAvatarKey.mockResolvedValue(
        makeCustomer({ avatarKey: 'customer-avatars/cust-1/a.jpg' }),
      );
      mockStorage.upload.mockResolvedValue({ key: 'customer-avatars/cust-1/a.jpg' });

      const result = await service.uploadOwnAvatar('user-1', {
        buffer: jpeg,
        mimetype: 'image/jpeg',
        size: jpeg.length,
        originalname: 'me.jpg',
      });

      expect(result.hasAvatar).toBe(true);
      expect(JSON.stringify(result)).not.toContain('customer-avatars');
      expect(mockStorage.upload).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CUSTOMER_AVATAR_UPDATED', entityId: 'cust-1' }),
      );
    });

    it('rejects a file that is not a real image', async () => {
      await expect(
        service.uploadOwnAvatar('user-1', {
          buffer: Buffer.from('not-an-image'),
          mimetype: 'image/png',
          size: 12,
          originalname: 'x.png',
        }),
      ).rejects.toThrow('فقط تصویر JPG، PNG یا WebP پذیرفته می‌شود.');
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });
  });

  describe('requestAccountDeletion', () => {
    it('does not delete the account when financial history exists', async () => {
      mockCustomerRepo.findByUserId.mockResolvedValue(makeCustomer());
      mockPrisma.order.count.mockResolvedValue(2);
      mockPrisma.trade.count.mockResolvedValue(0);
      mockPrisma.payment.count.mockResolvedValue(0);
      mockPrisma.customerAccount.findUnique.mockResolvedValue(null);

      await expect(service.requestAccountDeletion('user-1')).rejects.toBeInstanceOf(
        BusinessRuleException,
      );
      expect(mockAudit.log).not.toHaveBeenCalled();
    });

    it('records a request without deleting when there is no financial history', async () => {
      mockCustomerRepo.findByUserId.mockResolvedValue(makeCustomer());
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.trade.count.mockResolvedValue(0);
      mockPrisma.payment.count.mockResolvedValue(0);
      mockPrisma.customerAccount.findUnique.mockResolvedValue(null);

      const result = await service.requestAccountDeletion('user-1');

      expect(result.deleted).toBe(false);
      expect(result.accepted).toBe(true);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ACCOUNT_DELETION_REQUESTED' }),
      );
    });
  });

  // ── CustomerEntity domain logic ──────────────────────────────
  describe('CustomerEntity', () => {
    it('isTradeEligible requires ACTIVE status AND non-null type', () => {
      expect(
        makeCustomer({
          status: CustomerStatus.ACTIVE,
          type: CustomerType.HOUSEHOLD,
        }).isTradeEligible(),
      ).toBe(true);
      expect(makeCustomer({ status: CustomerStatus.ACTIVE, type: null }).isTradeEligible()).toBe(
        false,
      );
      expect(
        makeCustomer({
          status: CustomerStatus.APPROVED,
          type: CustomerType.HOUSEHOLD,
        }).isTradeEligible(),
      ).toBe(false);
    });

    it('canAssignType requires APPROVED or ACTIVE status', () => {
      expect(makeCustomer({ status: CustomerStatus.APPROVED }).canAssignType()).toBe(true);
      expect(makeCustomer({ status: CustomerStatus.ACTIVE }).canAssignType()).toBe(true);
      expect(makeCustomer({ status: CustomerStatus.PENDING }).canAssignType()).toBe(false);
      expect(makeCustomer({ status: CustomerStatus.UNDER_REVIEW }).canAssignType()).toBe(false);
    });
  });
});
