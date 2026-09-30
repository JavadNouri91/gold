import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { CustomerEntity } from '../../domain/entities/customer.entity';
import {
  CustomerAccountStatus,
  CustomerGender,
  CustomerLevel,
  CustomerStatus,
  CustomerType,
  ReferenceSource,
} from '@gold/shared-types';
import { Prisma } from '@prisma/client';

type CustomerRow = Prisma.CustomerGetPayload<Record<string, never>>;

@Injectable()
export class CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CustomerEntity | null> {
    const row = await this.prisma.customer.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByCustomerNumber(number: string): Promise<CustomerEntity | null> {
    const row = await this.prisma.customer.findUnique({
      where: { customerNumber: number },
    });
    return row ? this.toDomain(row) : null;
  }

  async findByUserId(userId: string): Promise<CustomerEntity | null> {
    const row = await this.prisma.customer.findUnique({
      where: { userId },
    });
    return row ? this.toDomain(row) : null;
  }

  async findByMobile(mobile: string): Promise<CustomerEntity | null> {
    const row = await this.prisma.customer.findUnique({ where: { mobile } });
    return row ? this.toDomain(row) : null;
  }

  async findByNationalId(nationalId: string): Promise<CustomerEntity | null> {
    const row = await this.prisma.customer.findUnique({ where: { nationalId } });
    return row ? this.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<CustomerEntity | null> {
    const row = await this.prisma.customer.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    return row ? this.toDomain(row) : null;
  }

  async list(params: {
    status?: CustomerStatus;
    type?: CustomerType;
    search?: string;
    page: number;
    limit: number;
  }): Promise<{ items: CustomerEntity[]; total: number }> {
    const where: Prisma.CustomerWhereInput = {};

    if (params.status) where.status = params.status;
    if (params.type) where.type = params.type;
    if (params.search) {
      where.OR = [
        { firstName: { contains: params.search, mode: 'insensitive' } },
        { lastName: { contains: params.search, mode: 'insensitive' } },
        { mobile: { contains: params.search } },
        { nationalId: { contains: params.search } },
        { customerNumber: { contains: params.search } },
      ];
    }

    const skip = (params.page - 1) * params.limit;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  async create(data: {
    customerNumber: string;
    userId: string;
    firstName: string;
    lastName: string;
    nationalId: string;
    mobile: string;
    email?: string;
    dateOfBirth?: Date;
    address?: string;
    type?: CustomerType;
    gender?: CustomerGender;
    level?: CustomerLevel;
    postalCode?: string;
    phone?: string;
    referenceSource?: ReferenceSource;
    companyName?: string;
    companyNationalId?: string;
    companyEconomicId?: string;
    contactName?: string;
    contactTitle?: string;
    secondaryMobile?: string;
    workPhone?: string;
    fax?: string;
    workAddress?: string;
    contactNotes?: string;
    province?: string;
    city?: string;
    status?: CustomerStatus;
    accountStatus?: CustomerAccountStatus;
  }): Promise<CustomerEntity> {
    const row = await this.prisma.customer.create({
      data: {
        customerNumber: data.customerNumber,
        userId: data.userId,
        firstName: data.firstName,
        lastName: data.lastName,
        nationalId: data.nationalId,
        mobile: data.mobile,
        email: data.email ?? null,
        dateOfBirth: data.dateOfBirth ?? null,
        address: data.address ?? null,
        type: data.type ?? null,
        gender: data.gender ?? null,
        level: data.level ?? null,
        postalCode: data.postalCode ?? null,
        phone: data.phone ?? null,
        referenceSource: data.referenceSource ?? null,
        companyName: data.companyName ?? null,
        companyNationalId: data.companyNationalId ?? null,
        companyEconomicId: data.companyEconomicId ?? null,
        contactName: data.contactName ?? null,
        contactTitle: data.contactTitle ?? null,
        secondaryMobile: data.secondaryMobile ?? null,
        workPhone: data.workPhone ?? null,
        fax: data.fax ?? null,
        workAddress: data.workAddress ?? null,
        contactNotes: data.contactNotes ?? null,
        province: data.province ?? null,
        city: data.city ?? null,
        status: data.status ?? 'PENDING',
        accountStatus: data.accountStatus ?? 'INACTIVE',
      },
    });
    return this.toDomain(row);
  }

  async updateStatus(
    id: string,
    status: CustomerStatus,
    rejectionReason?: string,
  ): Promise<CustomerEntity> {
    const row = await this.prisma.customer.update({
      where: { id },
      data: {
        status,
        rejectionReason: rejectionReason ?? null,
        updatedAt: new Date(),
      },
    });
    return this.toDomain(row);
  }

  async updateAccountStatus(
    id: string,
    accountStatus: CustomerAccountStatus,
  ): Promise<CustomerEntity> {
    const row = await this.prisma.customer.update({
      where: { id },
      data: { accountStatus },
    });
    return this.toDomain(row);
  }

  async updateAvatarKey(id: string, avatarKey: string | null): Promise<CustomerEntity> {
    const row = await this.prisma.customer.update({
      where: { id },
      data: { avatarKey },
    });
    return this.toDomain(row);
  }

  async updateType(id: string, type: CustomerType): Promise<CustomerEntity> {
    const row = await this.prisma.customer.update({
      where: { id },
      data: { type, updatedAt: new Date() },
    });
    return this.toDomain(row);
  }

  /**
   * Generate next customer number atomically within a transaction.
   * Format: CUST-000001
   */
  async nextCustomerNumber(tx?: Prisma.TransactionClient): Promise<string> {
    const client = tx ?? this.prisma;
    const count = await client.customer.count();
    const seq = count + 1;
    return `CUST-${String(seq).padStart(6, '0')}`;
  }

  private toDomain(row: CustomerRow): CustomerEntity {
    return new CustomerEntity({
      id: row.id,
      customerNumber: row.customerNumber,
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      nationalId: row.nationalId,
      mobile: row.mobile,
      email: row.email,
      dateOfBirth: row.dateOfBirth,
      address: row.address,
      avatarKey: row.avatarKey,
      type: row.type as CustomerType | null,
      gender: row.gender as CustomerGender | null,
      level: row.level as CustomerLevel | null,
      postalCode: row.postalCode,
      phone: row.phone,
      referenceSource: row.referenceSource as ReferenceSource | null,
      companyName: row.companyName,
      companyNationalId: row.companyNationalId,
      companyEconomicId: row.companyEconomicId,
      contactName: row.contactName,
      contactTitle: row.contactTitle,
      secondaryMobile: row.secondaryMobile,
      workPhone: row.workPhone,
      fax: row.fax,
      workAddress: row.workAddress,
      contactNotes: row.contactNotes,
      province: row.province,
      city: row.city,
      status: row.status as CustomerStatus,
      accountStatus: row.accountStatus as CustomerAccountStatus,
      rejectionReason: row.rejectionReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
