import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../../database/prisma.service';
import {
  SupplierEntity,
  SupplierStatus,
  SupplierIntegrationMode,
} from '../../domain/entities/supplier.entity';

/**
 * Supplier Repository
 *
 * Provides read/write access to Supplier and SupplierAccount records.
 * Write operations that affect SupplierAccount balance MUST be called
 * inside a Prisma transaction provided by the caller.
 */
@Injectable()
export class SupplierRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<SupplierEntity | null> {
    const row = await this.prisma.supplier.findUnique({ where: { id } });
    return row ? this.mapRow(row) : null;
  }

  async findByNumber(number: string): Promise<SupplierEntity | null> {
    const row = await this.prisma.supplier.findUnique({ where: { supplierNumber: number } });
    return row ? this.mapRow(row) : null;
  }

  async findAll(opts: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<SupplierEntity[]> {
    const rows = await this.prisma.supplier.findMany({
      where: opts.status ? { status: opts.status as SupplierStatus } : {},
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 50,
      skip: opts.offset ?? 0,
    });
    return rows.map((r) => this.mapRow(r));
  }

  async create(input: {
    supplierNumber: string;
    name: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    notes?: string;
  }): Promise<SupplierEntity> {
    const row = await this.prisma.supplier.create({
      data: {
        supplierNumber: input.supplierNumber,
        name: input.name,
        contactName: input.contactName ?? null,
        contactPhone: input.contactPhone ?? null,
        contactEmail: input.contactEmail ?? null,
        notes: input.notes ?? null,
        integrationMode: 'MANUAL',
        status: 'ACTIVE',
      },
    });
    return this.mapRow(row);
  }

  async update(
    id: string,
    input: Partial<{
      name: string;
      contactName: string | null;
      contactPhone: string | null;
      contactEmail: string | null;
      status: SupplierStatus;
      notes: string | null;
    }>,
  ): Promise<SupplierEntity> {
    const row = await this.prisma.supplier.update({
      where: { id },
      data: input,
    });
    return this.mapRow(row);
  }

  async createAccountForSupplier(supplierId: string): Promise<{
    id: string;
    supplierId: string;
    status: string;
    totalPurchasedRial: Decimal;
    totalPaidRial: Decimal;
  }> {
    return this.prisma.supplierAccount.create({
      data: { supplierId, totalPurchasedRial: 0, totalPaidRial: 0 },
    });
  }

  async findAccountBySupplierId(supplierId: string): Promise<{
    id: string;
    supplierId: string;
    status: string;
    totalPurchasedRial: Decimal;
    totalPaidRial: Decimal;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    return this.prisma.supplierAccount.findUnique({ where: { supplierId } });
  }

  /**
   * Increments the supplier account's totalPurchasedRial by the given amount.
   * Called inside a transaction when a Purchase is CONFIRMED.
   */
  async incrementPurchasedInTx(
    tx: import('@prisma/client').Prisma.TransactionClient,
    supplierId: string,
    amount: Decimal,
  ): Promise<void> {
    await tx.supplierAccount.update({
      where: { supplierId },
      data: { totalPurchasedRial: { increment: amount.toFixed(2) as unknown as number } },
    });
  }

  async nextSupplierNumber(): Promise<string> {
    const count = await this.prisma.supplier.count();
    return `SUP-${String(count + 1).padStart(6, '0')}`;
  }

  private mapRow(row: {
    id: string;
    supplierNumber: string;
    name: string;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    integrationMode: string;
    status: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): SupplierEntity {
    return new SupplierEntity({
      id: row.id,
      supplierNumber: row.supplierNumber,
      name: row.name,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      contactEmail: row.contactEmail,
      integrationMode: row.integrationMode as SupplierIntegrationMode,
      status: row.status as SupplierStatus,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
