import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { UsersService } from '../../users/application/users.service';
import { CustomerRepository } from '../infrastructure/repositories/customer.repository';
import { CustomerAccountRepository } from '../../customer-accounts/infrastructure/repositories/customer-account.repository';
import { BusinessRuleException } from '../../../common/exceptions/business-rule.exception';
import { CustomerEntity } from '../domain/entities/customer.entity';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { AssignCustomerTypeDto } from './dto/assign-customer-type.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import { CustomerAccountStatus, CustomerStatus } from '@gold/shared-types';
import { PaginationMeta } from '@gold/shared-types';
import { StorageService } from '../../../common/storage/storage.service';
import { assertAvatarFile, mimeFromAvatarKey } from '../domain/avatar-file';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customerRepo: CustomerRepository,
    private readonly accountRepo: CustomerAccountRepository,
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  // ----------------------------------------------------------------
  // UC-01: Register Customer
  // Creates a User record + Customer profile atomically
  // ----------------------------------------------------------------
  async register(dto: RegisterCustomerDto, ipAddress?: string): Promise<CustomerResponseDto> {
    // Duplicate checks
    const existingMobile = await this.customerRepo.findByMobile(dto.mobile);
    if (existingMobile) {
      throw new ConflictException('Mobile number is already registered');
    }

    const existingNationalId = await this.customerRepo.findByNationalId(dto.nationalId);
    if (existingNationalId) {
      throw new ConflictException('National ID is already registered');
    }

    if (dto.email) {
      const existingEmail = await this.customerRepo.findByEmail(dto.email);
      if (existingEmail) {
        throw new ConflictException('Email address is already registered');
      }
    }

    // Check User table for mobile clash (staff may share mobile)
    const existingUser = await this.usersService.findByMobile(dto.mobile);
    if (existingUser) {
      throw new ConflictException('Mobile number is already in use');
    }

    // Resolve 'customer' role ID for new user
    const customerRole = await this.prisma.role.findUnique({
      where: { name: 'customer' },
    });
    if (!customerRole) {
      throw new Error('System role "customer" not found — run db:seed first');
    }

    // Create User + Customer atomically
    const customer = await this.prisma.$transaction(async (tx) => {
      // Create the User account
      const user = await this.usersService.createCustomerUser(
        {
          name: `${dto.firstName} ${dto.lastName}`,
          mobile: dto.mobile,
          email: dto.email,
          password: dto.password,
          roleId: customerRole.id,
        },
        tx,
      );

      // Generate customer number within the same transaction
      const customerNumber = await this.customerRepo.nextCustomerNumber(tx);

      // Determine initial status and accountStatus for staff-registered customers
      const initialAccountStatus = dto.initialAccountStatus ?? 'INACTIVE';
      const initialStatus = initialAccountStatus === 'ACTIVE' ? 'ACTIVE' : 'PENDING';

      // Create Customer profile
      const customerRow = await tx.customer.create({
        data: {
          customerNumber,
          userId: user.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          nationalId: dto.nationalId,
          mobile: dto.mobile,
          email: dto.email ?? null,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          address: dto.address ?? null,
          type: dto.type ?? null,
          gender: dto.gender ?? null,
          level: dto.level ?? null,
          postalCode: dto.postalCode ?? null,
          phone: dto.phone ?? null,
          referenceSource: dto.referenceSource ?? null,
          companyName: dto.companyName ?? null,
          companyNationalId: dto.companyNationalId ?? null,
          companyEconomicId: dto.companyEconomicId ?? null,
          contactName: dto.contactName ?? null,
          contactTitle: dto.contactTitle ?? null,
          secondaryMobile: dto.secondaryMobile ?? null,
          workPhone: dto.workPhone ?? null,
          fax: dto.fax ?? null,
          workAddress: dto.workAddress ?? null,
          contactNotes: dto.contactNotes ?? null,
          province: dto.province ?? null,
          city: dto.city ?? null,
          status: initialStatus,
          accountStatus: initialAccountStatus,
        },
      });

      return customerRow;
    });

    // If customer was created as ACTIVE, create their account immediately
    if (customer.accountStatus === 'ACTIVE') {
      try {
        await this.accountRepo.createForCustomer(customer.id);
      } catch {
        // Account may already exist; non-fatal
      }
    }

    // Create internal note if provided
    if (dto.internalNote?.trim()) {
      await this.prisma.customerNote.create({
        data: {
          customerId: customer.id,
          body: dto.internalNote.trim(),
          authorId: null, // system/staff note
        },
      });
    }

    // Audit customer creation
    await this.audit.log({
      actorId: null, // self-registration — no actor
      actorType: 'SYSTEM',
      action: 'CUSTOMER_REGISTERED',
      entityType: 'Customer',
      entityId: customer.id,
      after: {
        customerNumber: customer.customerNumber,
        mobile: customer.mobile,
        nationalId: customer.nationalId,
        status: customer.status,
      },
      ipAddress,
    });

    this.logger.log(`Customer registered: ${customer.customerNumber} (${customer.mobile})`);

    const entity = await this.customerRepo.findById(customer.id);
    return CustomerResponseDto.fromEntity(entity!);
  }

  // ----------------------------------------------------------------
  // List customers (staff)
  // ----------------------------------------------------------------
  async list(
    dto: ListCustomersDto,
  ): Promise<{ items: CustomerResponseDto[]; meta: PaginationMeta }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const { items, total } = await this.customerRepo.list({
      status: dto.status,
      type: dto.type,
      search: dto.search,
      page,
      limit,
    });

    return {
      items: items.map(CustomerResponseDto.fromEntity),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ----------------------------------------------------------------
  // Get customer by ID
  // ----------------------------------------------------------------
  async findById(id: string): Promise<CustomerResponseDto> {
    const entity = await this.customerRepo.findById(id);
    if (!entity) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return CustomerResponseDto.fromEntity(entity);
  }

  // ----------------------------------------------------------------
  // Get customer profile for authenticated customer user
  // ----------------------------------------------------------------
  async findByUserId(userId: string): Promise<CustomerResponseDto> {
    const entity = await this.customerRepo.findByUserId(userId);
    if (!entity) {
      throw new NotFoundException('Customer profile not found');
    }
    return CustomerResponseDto.fromEntity(entity);
  }

  // ----------------------------------------------------------------
  // UC-04: Assign Customer Type (BR-C02, BR-C03)
  // ----------------------------------------------------------------
  async assignType(
    customerId: string,
    dto: AssignCustomerTypeDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<CustomerResponseDto> {
    const entity = await this.requireCustomer(customerId);

    if (!entity.canAssignType()) {
      throw new BusinessRuleException(
        'CUSTOMER_TYPE_ASSIGNMENT_NOT_ALLOWED',
        `Cannot assign type: customer is in status ${entity.status}. Customer must be APPROVED or ACTIVE.`,
      );
    }

    const before = { type: entity.type, status: entity.status };

    const updated = await this.customerRepo.updateType(customerId, dto.type);

    // BR-C03: type change MUST be audited
    await this.audit.log({
      actorId,
      action: 'CUSTOMER_TYPE_ASSIGNED',
      entityType: 'Customer',
      entityId: customerId,
      before,
      after: { type: updated.type, status: updated.status },
      reason: dto.reason,
      ipAddress,
    });

    // If customer was APPROVED and now has a type, activate them
    if (entity.status === CustomerStatus.APPROVED && updated.type !== null) {
      const activated = await this.customerRepo.updateStatus(customerId, CustomerStatus.ACTIVE);
      await this.customerRepo.updateAccountStatus(customerId, CustomerAccountStatus.ACTIVE);

      await this.audit.log({
        actorId,
        action: 'CUSTOMER_ACTIVATED',
        entityType: 'Customer',
        entityId: customerId,
        before: { status: CustomerStatus.APPROVED },
        after: { status: CustomerStatus.ACTIVE },
        reason: 'Customer type assigned; account activated',
        ipAddress,
      });

      return CustomerResponseDto.fromEntity(activated);
    }

    return CustomerResponseDto.fromEntity(updated);
  }

  // ----------------------------------------------------------------
  // Internal: resolve customer or throw 404
  // ----------------------------------------------------------------
  private async requireCustomer(id: string): Promise<CustomerEntity> {
    const entity = await this.customerRepo.findById(id);
    if (!entity) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return entity;
  }

  // ----------------------------------------------------------------
  // Internal: KYC module calls these to update status
  // ----------------------------------------------------------------
  async markUnderReview(customerId: string, actorId: string): Promise<CustomerEntity> {
    const entity = await this.requireCustomer(customerId);

    if (!entity.canStartReview()) {
      throw new BusinessRuleException(
        'CUSTOMER_REVIEW_NOT_ALLOWED',
        `Cannot start review: customer is in status ${entity.status}`,
      );
    }

    const updated = await this.customerRepo.updateStatus(customerId, CustomerStatus.UNDER_REVIEW);

    await this.audit.log({
      actorId,
      action: 'CUSTOMER_REVIEW_STARTED',
      entityType: 'Customer',
      entityId: customerId,
      before: { status: entity.status },
      after: { status: updated.status },
    });

    return updated;
  }

  async approve(customerId: string, actorId: string, ipAddress?: string): Promise<CustomerEntity> {
    const entity = await this.requireCustomer(customerId);

    if (!entity.canApprove()) {
      throw new BusinessRuleException(
        'CUSTOMER_APPROVAL_NOT_ALLOWED',
        `Cannot approve: customer is in status ${entity.status}. Must be UNDER_REVIEW.`,
      );
    }

    const updated = await this.customerRepo.updateStatus(customerId, CustomerStatus.APPROVED);
    await this.customerRepo.updateAccountStatus(customerId, CustomerAccountStatus.ACTIVE);

    await this.audit.log({
      actorId,
      action: 'CUSTOMER_APPROVED',
      entityType: 'Customer',
      entityId: customerId,
      before: { status: entity.status },
      after: { status: updated.status },
      ipAddress,
    });

    // Create CustomerAccount immediately on approval — §3 business decision
    await this.accountRepo.createForCustomer(customerId);

    await this.audit.log({
      actorId,
      action: 'CUSTOMER_ACCOUNT_CREATED',
      entityType: 'CustomerAccount',
      entityId: customerId,
      after: {
        customerId,
        status: 'ACTIVE',
        creditLimitRial: '0',
        creditLimitGoldRial: '0',
      },
      reason: 'Account created on KYC approval',
      ipAddress,
    });

    return updated;
  }

  async reject(
    customerId: string,
    reason: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<CustomerEntity> {
    const entity = await this.requireCustomer(customerId);

    if (!entity.canReject()) {
      throw new BusinessRuleException(
        'CUSTOMER_REJECTION_NOT_ALLOWED',
        `Cannot reject: customer is in status ${entity.status}. Must be UNDER_REVIEW.`,
      );
    }

    const updated = await this.customerRepo.updateStatus(
      customerId,
      CustomerStatus.REJECTED,
      reason,
    );
    await this.customerRepo.updateAccountStatus(customerId, CustomerAccountStatus.INACTIVE);

    await this.audit.log({
      actorId,
      action: 'CUSTOMER_REJECTED',
      entityType: 'Customer',
      entityId: customerId,
      before: { status: entity.status },
      after: { status: updated.status, rejectionReason: reason },
      reason,
      ipAddress,
    });

    return updated;
  }

  // ----------------------------------------------------------------
  // Customer self-service: contact fields only
  // ----------------------------------------------------------------
  async updateOwnProfile(
    userId: string,
    dto: UpdateOwnProfileDto,
    ipAddress?: string,
  ): Promise<CustomerResponseDto> {
    const current = await this.customerRepo.findByUserId(userId);
    if (!current) {
      throw new NotFoundException('پروفایل مشتری پیدا نشد');
    }

    const data: {
      email?: string | null;
      address?: string | null;
      postalCode?: string | null;
    } = {};

    if (dto.email !== undefined) {
      data.email = dto.email.trim().toLowerCase() || null;
    }
    if (dto.address !== undefined) {
      data.address = dto.address.trim() || null;
    }
    if (dto.postalCode !== undefined) {
      data.postalCode = dto.postalCode.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('هیچ تغییری ارسال نشده است');
    }

    if (data.email && data.email !== current.email) {
      const [customerHit, userHit] = await Promise.all([
        this.customerRepo.findByEmail(data.email),
        this.prisma.user.findUnique({ where: { email: data.email } }),
      ]);
      if (customerHit && customerHit.id !== current.id) {
        throw new ConflictException('این ایمیل قبلاً ثبت شده است');
      }
      if (userHit && userHit.id !== current.userId) {
        throw new ConflictException('این ایمیل قبلاً ثبت شده است');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id: current.id }, data });
      if (current.userId && dto.email !== undefined) {
        await tx.user.update({
          where: { id: current.userId },
          data: { email: data.email ?? null },
        });
      }
    });

    await this.audit.log({
      actorId: userId,
      action: 'CUSTOMER_CONTACT_UPDATED',
      entityType: 'Customer',
      entityId: current.id,
      before: {
        email: current.email,
        address: current.address,
        postalCode: current.postalCode,
      },
      after: {
        email: data.email !== undefined ? data.email : current.email,
        address: data.address !== undefined ? data.address : current.address,
        postalCode: data.postalCode !== undefined ? data.postalCode : current.postalCode,
      },
      ipAddress,
    });

    return this.findByUserId(userId);
  }

  /**
   * Records a deletion request. Never deletes the customer.
   * Financial history blocks the request so accounting records stay intact.
   */
  async requestAccountDeletion(
    userId: string,
    ipAddress?: string,
  ): Promise<{ accepted: boolean; deleted: boolean; message: string }> {
    const current = await this.customerRepo.findByUserId(userId);
    if (!current) {
      throw new NotFoundException('پروفایل مشتری پیدا نشد');
    }

    const [orders, trades, payments, account] = await Promise.all([
      this.prisma.order.count({ where: { customerId: current.id } }),
      this.prisma.trade.count({ where: { customerId: current.id } }),
      this.prisma.payment.count({ where: { customerId: current.id } }),
      this.prisma.customerAccount.findUnique({ where: { customerId: current.id } }),
    ]);

    const hasFinancialHistory =
      orders > 0 ||
      trades > 0 ||
      payments > 0 ||
      isPositiveAmount(account?.creditLimitRial) ||
      isPositiveAmount(account?.reservedCreditRial) ||
      isPositiveAmount(account?.consumedCreditRial) ||
      isPositiveAmount(account?.creditLimitGoldRial) ||
      isPositiveAmount(account?.reservedCreditGoldRial) ||
      isPositiveAmount(account?.consumedCreditGoldRial);

    if (hasFinancialHistory) {
      throw new BusinessRuleException(
        'ACCOUNT_DELETION_BLOCKED',
        'به دلیل وجود سوابق مالی و معاملاتی، حذف مستقیم حساب امکان‌پذیر نیست. لطفاً با پشتیبانی تماس بگیرید.',
      );
    }

    await this.audit.log({
      actorId: userId,
      action: 'ACCOUNT_DELETION_REQUESTED',
      entityType: 'Customer',
      entityId: current.id,
      reason: 'Customer requested account deletion. The account was not deleted.',
      ipAddress,
    });

    return {
      accepted: true,
      deleted: false,
      message:
        'درخواست حذف حساب ثبت شد و توسط پشتیبانی بررسی می‌شود. تا زمان بررسی، حساب شما فعال می‌ماند.',
    };
  }

  async uploadOwnAvatar(
    userId: string,
    file: { buffer: Buffer; mimetype: string; size: number; originalname?: string } | undefined,
    ipAddress?: string,
  ): Promise<CustomerResponseDto> {
    if (!file) {
      throw new BadRequestException('لطفاً یک تصویر انتخاب کنید.');
    }
    const mime = assertAvatarFile(file);
    const current = await this.customerRepo.findByUserId(userId);
    if (!current) {
      throw new NotFoundException('پروفایل مشتری پیدا نشد');
    }

    const stored = await this.storage.upload({
      buffer: file.buffer,
      originalName: file.originalname || 'avatar',
      mimeType: mime,
      sizeBytes: file.size,
      prefix: `customer-avatars/${current.id}`,
    });

    await this.customerRepo.updateAvatarKey(current.id, stored.key);

    if (current.avatarKey && current.avatarKey !== stored.key) {
      try {
        await this.storage.delete(current.avatarKey);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Previous avatar could not be removed: ${message}`);
      }
    }

    await this.audit.log({
      actorId: userId,
      action: 'CUSTOMER_AVATAR_UPDATED',
      entityType: 'Customer',
      entityId: current.id,
      before: { hasAvatar: Boolean(current.avatarKey) },
      after: { hasAvatar: true },
      ipAddress,
    });

    return this.findByUserId(userId);
  }

  async readOwnAvatar(userId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const current = await this.customerRepo.findByUserId(userId);
    if (!current?.avatarKey) {
      throw new NotFoundException('عکس پروفایل ثبت نشده است');
    }
    const buffer = await this.storage.getObject(current.avatarKey);
    return { buffer, mimeType: mimeFromAvatarKey(current.avatarKey) };
  }

  // ----------------------------------------------------------------
  // Email availability check
  // ----------------------------------------------------------------
  async checkEmailAvailable(email: string): Promise<{ available: boolean }> {
    const normalised = email.toLowerCase().trim();
    const existing = await this.customerRepo.findByEmail(normalised);
    return { available: existing === null };
  }
}

function isPositiveAmount(value: { toString(): string } | null | undefined): boolean {
  if (value == null) return false;
  const num = Number(value.toString());
  return Number.isFinite(num) && num > 0;
}
