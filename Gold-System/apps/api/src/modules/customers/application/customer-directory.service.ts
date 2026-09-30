import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CustomerAccountStatus,
  CustomerStatus,
  CustomerType,
  PaginationMeta,
} from '@gold/shared-types';
import { formatMobile, toLatinDigits } from '../../../common/digits';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { CurrentUserData } from '../../../common/decorators/current-user.decorator';
import { CustomersService } from './customers.service';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { SetAccountStatusDto } from './dto/set-account-status.dto';
import { CreateCustomerNoteDto } from './dto/customer-note.dto';
import { ImportCustomersDto } from './dto/import-customers.dto';
import {
  CustomerFinancialStatus,
  CustomerSegment,
  CustomerStats,
  csvCell,
  emptyStats,
  matchesFinancial,
  matchesLastPurchase,
  matchesSegment,
  primarySegment,
  statusesForVerification,
  tehranDayEnd,
  tehranDayStart,
  verificationOf,
} from './customer-directory.policy';

const PURCHASE_EXCLUDED = ['CANCELLED', 'REJECTED', 'DRAFT'] as const;
const PAID_STATUSES = ['VALIDATED', 'ALLOCATED', 'COMPLETED'] as const;
const EXPORT_LIMIT = 5000;

interface LightCustomer {
  id: string;
  createdAt: Date;
  type: string | null;
  status: string;
  accountStatus: string;
}

export interface DirectoryListItem extends CustomerResponseDto {
  verificationStatus: string;
  segment: string;
  orderCount: number;
  lastPurchaseAt: Date | null;
  balanceRial: string | null;
  totalPurchaseRial: string | null;
  totalWeightGrams: string;
}

@Injectable()
export class CustomerDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly audit: AuditService,
  ) {}

  async summary(user: CurrentUserData) {
    const canFinance = this.canReadFinance(user);
    const now = new Date();
    const newSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [total, active, vip, newCustomers, stats] = await Promise.all([
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { accountStatus: 'ACTIVE' } }),
      this.prisma.customer.count({ where: { type: 'VIP' } }),
      this.prisma.customer.count({ where: { createdAt: { gte: newSince } } }),
      canFinance ? this.loadStats() : Promise.resolve(new Map<string, CustomerStats>()),
    ]);

    let debtors: number | null = null;
    if (canFinance) {
      debtors = 0;
      for (const row of stats.values()) {
        if (row.balance.lessThan(0)) debtors += 1;
      }
    }

    return { total, active, vip, debtors, newCustomers };
  }

  async list(dto: ListCustomersDto, user: CurrentUserData) {
    this.assertFinancialFilter(dto, user);
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const { rows, stats } = await this.match(dto);
    const slice = rows.slice((page - 1) * limit, page * limit);
    const items = await this.hydrate(
      slice.map((row) => row.id),
      stats,
      user,
    );
    const meta: PaginationMeta = {
      page,
      limit,
      total: rows.length,
      totalPages: Math.max(1, Math.ceil(rows.length / limit)),
    };
    return { items, meta };
  }

  async exportCsv(dto: ListCustomersDto, user: CurrentUserData): Promise<{ content: string }> {
    this.assertFinancialFilter(dto, user);
    const { rows, stats } = await this.match(dto);
    const items = await this.hydrate(
      rows.slice(0, EXPORT_LIMIT).map((row) => row.id),
      stats,
      user,
    );
    const canFinance = this.canReadFinance(user);
    const headers = [
      'کد مشتری',
      'نام',
      'موبایل',
      'کد ملی',
      'نوع',
      'وضعیت حساب',
      'وضعیت احراز',
      'سطح',
      'تعداد سفارش',
      'آخرین خرید',
      ...(canFinance ? ['مانده حساب (ریال)'] : []),
    ];
    const lines = [headers.map(csvCell).join(',')];
    for (const item of items) {
      const cells = [
        item.customerNumber,
        item.fullName,
        formatMobile(item.mobile, ''),
        item.nationalId,
        item.type ?? '',
        item.accountStatus,
        item.verificationStatus,
        item.segment,
        String(item.orderCount),
        item.lastPurchaseAt ? item.lastPurchaseAt.toISOString() : '',
        ...(canFinance ? [item.balanceRial ?? '0.00'] : []),
      ];
      lines.push(cells.map(csvCell).join(','));
    }
    return { content: `\uFEFF${lines.join('\r\n')}` };
  }

  async importRows(dto: ImportCustomersDto, ipAddress?: string) {
    const errors: Array<{ row: number; message: string }> = [];
    let created = 0;
    for (const [index, row] of dto.rows.entries()) {
      try {
        await this.customers.register(
          {
            firstName: row.firstName.trim(),
            lastName: row.lastName.trim(),
            nationalId: row.nationalId.trim(),
            mobile: row.mobile.trim(),
            password: row.password,
            email: row.email?.trim() || undefined,
            address: row.address?.trim() || undefined,
          },
          ipAddress,
        );
        created += 1;
      } catch (err) {
        errors.push({
          row: index + 1,
          message: err instanceof Error ? err.message : 'ثبت این ردیف انجام نشد',
        });
      }
    }
    return { created, failed: errors.length, errors };
  }

  async workspace(id: string, user: CurrentUserData) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('مشتری پیدا نشد');
    const canFinance = this.canReadFinance(user);
    const stats = await this.statsFor(id);
    const [orders, quotations, invoices, payments, notes] = await Promise.all([
      this.prisma.order.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmountRial: true,
          weightGrams: true,
          createdAt: true,
        },
      }),
      this.prisma.quotation.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          quotationNumber: true,
          status: true,
          totalAmountRial: true,
          createdAt: true,
        },
      }),
      this.prisma.trade.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          tradeNumber: true,
          status: true,
          totalAmountRial: true,
          createdAt: true,
        },
      }),
      canFinance
        ? this.prisma.payment.findMany({
            where: { customerId: id },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
              id: true,
              amount: true,
              status: true,
              method: true,
              referenceNumber: true,
              createdAt: true,
            },
          })
        : Promise.resolve(null),
      this.prisma.customerNote.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { author: { select: { name: true } } },
      }),
    ]);

    const facts = this.facts(customer);
    return {
      customer: this.toDirectoryItem(customer, stats, canFinance),
      metrics: {
        totalPurchaseRial: canFinance ? stats.purchaseTotal.toFixed(2) : null,
        totalWeightGrams: stats.weightGrams.toFixed(6),
        orderCount: stats.orderCount,
        lastPurchaseAt: stats.lastPurchaseAt,
        balanceRial: canFinance ? stats.balance.toFixed(2) : null,
      },
      segment: primarySegment(facts),
      verificationStatus: verificationOf(customer.status as CustomerStatus),
      orders: orders.map((order) => ({
        ...order,
        totalAmountRial: order.totalAmountRial.toFixed(2),
        weightGrams: order.weightGrams.toFixed(6),
      })),
      quotations: quotations.map((row) => ({
        ...row,
        totalAmountRial: row.totalAmountRial.toFixed(2),
      })),
      invoices: invoices.map((row) => ({
        ...row,
        totalAmountRial: row.totalAmountRial.toFixed(2),
      })),
      payments: payments
        ? payments.map((row) => ({ ...row, amount: row.amount.toFixed(2) }))
        : null,
      notes: notes.map((note) => ({
        id: note.id,
        body: note.body,
        authorName: note.author?.name ?? null,
        createdAt: note.createdAt,
      })),
      canViewFinancials: canFinance,
    };
  }

  async updateProfile(id: string, dto: UpdateCustomerDto, actorId: string, ipAddress?: string) {
    const current = await this.prisma.customer.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('مشتری پیدا نشد');

    if (dto.mobile && dto.mobile !== current.mobile) {
      const [customerHit, userHit] = await Promise.all([
        this.prisma.customer.findUnique({ where: { mobile: dto.mobile } }),
        this.prisma.user.findUnique({ where: { mobile: dto.mobile } }),
      ]);
      if (customerHit || (userHit && userHit.id !== current.userId)) {
        throw new ConflictException('این شماره موبایل قبلاً ثبت شده است');
      }
    }
    if (dto.nationalId && dto.nationalId !== current.nationalId) {
      const hit = await this.prisma.customer.findUnique({ where: { nationalId: dto.nationalId } });
      if (hit) throw new ConflictException('این کد ملی قبلاً ثبت شده است');
    }

    const data: Prisma.CustomerUpdateInput = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    if (dto.nationalId !== undefined) data.nationalId = dto.nationalId.trim();
    if (dto.mobile !== undefined) data.mobile = dto.mobile.trim();
    if (dto.email !== undefined) data.email = dto.email.trim() || null;
    if (dto.address !== undefined) data.address = dto.address.trim() || null;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('هیچ تغییری ارسال نشده است');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.customer.update({ where: { id }, data });
      if (current.userId && (dto.mobile || dto.firstName || dto.lastName)) {
        await tx.user.update({
          where: { id: current.userId },
          data: {
            ...(dto.mobile ? { mobile: dto.mobile.trim() } : {}),
            ...(dto.firstName || dto.lastName ? { name: `${row.firstName} ${row.lastName}` } : {}),
          },
        });
      }
      return row;
    });

    await this.audit.log({
      actorId,
      action: 'CUSTOMER_PROFILE_UPDATED',
      entityType: 'Customer',
      entityId: id,
      before: {
        firstName: current.firstName,
        lastName: current.lastName,
        mobile: current.mobile,
        nationalId: current.nationalId,
      },
      after: {
        firstName: updated.firstName,
        lastName: updated.lastName,
        mobile: updated.mobile,
        nationalId: updated.nationalId,
      },
      ipAddress,
    });

    return this.customers.findById(id);
  }

  async setAccountStatus(
    id: string,
    dto: SetAccountStatusDto,
    actorId: string,
    ipAddress?: string,
  ) {
    const current = await this.prisma.customer.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('مشتری پیدا نشد');
    if (current.accountStatus === dto.accountStatus) {
      throw new BadRequestException('وضعیت حساب همین مقدار است');
    }
    const updated = await this.prisma.customer.update({
      where: { id },
      data: { accountStatus: dto.accountStatus },
    });
    await this.audit.log({
      actorId,
      action: 'CUSTOMER_ACCOUNT_STATUS_CHANGED',
      entityType: 'Customer',
      entityId: id,
      before: { accountStatus: current.accountStatus },
      after: { accountStatus: updated.accountStatus },
      reason: dto.reason,
      ipAddress,
    });
    return { id: updated.id, accountStatus: updated.accountStatus };
  }

  async addNote(id: string, dto: CreateCustomerNoteDto, actorId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!customer) throw new NotFoundException('مشتری پیدا نشد');
    const note = await this.prisma.customerNote.create({
      data: { customerId: id, authorId: actorId, body: dto.body.trim() },
      include: { author: { select: { name: true } } },
    });
    await this.audit.log({
      actorId,
      action: 'CUSTOMER_NOTE_CREATED',
      entityType: 'CustomerNote',
      entityId: note.id,
      after: { customerId: id },
    });
    return {
      id: note.id,
      body: note.body,
      authorName: note.author?.name ?? null,
      createdAt: note.createdAt,
    };
  }

  async deleteNote(customerId: string, noteId: string, actorId: string) {
    const note = await this.prisma.customerNote.findFirst({
      where: { id: noteId, customerId },
    });
    if (!note) throw new NotFoundException('یادداشت پیدا نشد');
    await this.prisma.customerNote.delete({ where: { id: noteId } });
    await this.audit.log({
      actorId,
      action: 'CUSTOMER_NOTE_DELETED',
      entityType: 'CustomerNote',
      entityId: noteId,
      before: { customerId },
    });
    return { id: noteId };
  }

  private assertFinancialFilter(dto: ListCustomersDto, user: CurrentUserData) {
    if (dto.financialStatus && !this.canReadFinance(user)) {
      throw new ForbiddenException('مشاهده وضعیت مالی نیاز به مجوز حساب مشتری دارد');
    }
  }

  private canReadFinance(user: CurrentUserData): boolean {
    return user.permissions?.includes('customer.account.read') ?? false;
  }

  private async match(
    dto: ListCustomersDto,
  ): Promise<{ rows: LightCustomer[]; stats: Map<string, CustomerStats> }> {
    const where = this.where(dto);
    const [customers, stats] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          type: true,
          status: true,
          accountStatus: true,
        },
      }),
      this.loadStats(),
    ]);

    const now = new Date();
    const rows = customers.filter((customer) => {
      const facts = this.facts(customer);
      if (dto.segment && !matchesSegment(facts, dto.segment as CustomerSegment, now)) return false;
      const rowStats = stats.get(customer.id) ?? emptyStats();
      if (
        dto.financialStatus &&
        !matchesFinancial(rowStats.balance, dto.financialStatus as CustomerFinancialStatus)
      ) {
        return false;
      }
      if (!matchesLastPurchase(rowStats.lastPurchaseAt, dto.lastPurchaseFrom, dto.lastPurchaseTo)) {
        return false;
      }
      return true;
    });
    return { rows, stats };
  }

  private where(dto: ListCustomersDto): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = {};
    if (dto.status) where.status = dto.status;
    if (dto.type) where.type = dto.type;
    if (dto.accountStatus) where.accountStatus = dto.accountStatus;
    if (dto.verificationStatus) {
      where.status = { in: statusesForVerification(dto.verificationStatus) };
    }
    if (dto.createdFrom || dto.createdTo) {
      where.createdAt = {
        ...(dto.createdFrom ? { gte: tehranDayStart(dto.createdFrom) } : {}),
        ...(dto.createdTo ? { lte: tehranDayEnd(dto.createdTo) } : {}),
      };
    }
    if (dto.search?.trim()) {
      const search = toLatinDigits(dto.search.trim());
      const parts = search.split(/\s+/).filter(Boolean);
      const or: Prisma.CustomerWhereInput[] = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { mobile: { contains: search } },
        { nationalId: { contains: search } },
        { customerNumber: { contains: search, mode: 'insensitive' } },
      ];
      if (parts.length >= 2) {
        or.push({
          AND: [
            { firstName: { contains: parts[0], mode: 'insensitive' } },
            { lastName: { contains: parts.slice(1).join(' '), mode: 'insensitive' } },
          ],
        });
      }
      where.OR = or;
    }
    return where;
  }

  private async hydrate(
    ids: string[],
    stats: Map<string, CustomerStats>,
    user: CurrentUserData,
  ): Promise<DirectoryListItem[]> {
    if (!ids.length) return [];
    const canFinance = this.canReadFinance(user);
    const rows = await this.prisma.customer.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      if (!row) return [];
      return [this.toDirectoryItem(row, stats.get(id) ?? emptyStats(), canFinance)];
    });
  }

  private toDirectoryItem(
    row: {
      id: string;
      customerNumber: string;
      userId: string | null;
      firstName: string;
      lastName: string;
      nationalId: string;
      mobile: string;
      email: string | null;
      dateOfBirth: Date | null;
      address: string | null;
      type: string | null;
      status: string;
      accountStatus: string;
      rejectionReason: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    stats: CustomerStats,
    canFinance: boolean,
  ): DirectoryListItem {
    const status = row.status as CustomerStatus;
    const accountStatus = row.accountStatus as CustomerAccountStatus;
    const type = (row.type as CustomerType | null) ?? null;
    const facts = {
      type,
      status,
      accountStatus,
      createdAt: row.createdAt,
    };
    const item = new CustomerResponseDto();
    item.id = row.id;
    item.customerNumber = row.customerNumber;
    item.userId = row.userId;
    item.firstName = row.firstName;
    item.lastName = row.lastName;
    item.fullName = `${row.firstName} ${row.lastName}`;
    item.nationalId = row.nationalId;
    item.mobile = row.mobile;
    item.email = row.email;
    item.dateOfBirth = row.dateOfBirth;
    item.address = row.address;
    item.type = type;
    item.status = status;
    item.accountStatus = accountStatus;
    item.rejectionReason = row.rejectionReason;
    item.isTradeEligible =
      status === CustomerStatus.ACTIVE &&
      accountStatus === CustomerAccountStatus.ACTIVE &&
      type !== null;
    item.createdAt = row.createdAt;
    item.updatedAt = row.updatedAt;
    return Object.assign(item, {
      verificationStatus: verificationOf(status),
      segment: primarySegment(facts),
      orderCount: stats.orderCount,
      lastPurchaseAt: stats.lastPurchaseAt,
      balanceRial: canFinance ? stats.balance.toFixed(2) : null,
      totalPurchaseRial: canFinance ? stats.purchaseTotal.toFixed(2) : null,
      totalWeightGrams: stats.weightGrams.toFixed(6),
    });
  }

  private facts(row: {
    type: string | null;
    status: string;
    accountStatus: string;
    createdAt: Date;
  }) {
    return {
      type: (row.type as CustomerType | null) ?? null,
      status: row.status as CustomerStatus,
      accountStatus: row.accountStatus as CustomerAccountStatus,
      createdAt: row.createdAt,
    };
  }

  private async loadStats(): Promise<Map<string, CustomerStats>> {
    const [orders, payments] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['customerId'],
        where: { status: { notIn: [...PURCHASE_EXCLUDED] } },
        _count: { _all: true },
        _sum: { totalAmountRial: true, weightGrams: true },
        _max: { createdAt: true },
      }),
      this.prisma.payment.groupBy({
        by: ['customerId'],
        where: { status: { in: [...PAID_STATUSES] } },
        _sum: { amount: true },
      }),
    ]);

    const map = new Map<string, CustomerStats>();
    for (const order of orders) {
      const purchaseTotal = order._sum.totalAmountRial ?? new Prisma.Decimal(0);
      const weightGrams = order._sum.weightGrams ?? new Prisma.Decimal(0);
      map.set(order.customerId, {
        orderCount: order._count._all,
        lastPurchaseAt: order._max.createdAt,
        purchaseTotal,
        paidTotal: new Prisma.Decimal(0),
        weightGrams,
        balance: purchaseTotal.negated(),
      });
    }
    for (const payment of payments) {
      const paid = payment._sum.amount ?? new Prisma.Decimal(0);
      const current = map.get(payment.customerId) ?? emptyStats();
      const balance = paid.minus(current.purchaseTotal);
      map.set(payment.customerId, { ...current, paidTotal: paid, balance });
    }
    return map;
  }

  private async statsFor(customerId: string): Promise<CustomerStats> {
    const stats = await this.loadStats();
    return stats.get(customerId) ?? emptyStats();
  }
}
