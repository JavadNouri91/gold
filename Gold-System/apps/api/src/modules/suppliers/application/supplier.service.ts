import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';

import { PrismaService } from '../../../database/prisma.service';
import { SupplierRepository } from '../infrastructure/repositories/supplier.repository';
import { AuditService } from '../../audit/application/audit.service';
import { SupplierEntity, SupplierStatus } from '../domain/entities/supplier.entity';
import {
  SupplierNotFoundException,
  DuplicateSupplierNumberException,
  SupplierAccountNotFoundException,
} from '../domain/exceptions/supplier.exceptions';

export class SupplierResponseDto {
  id: string;
  supplierNumber: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  integrationMode: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;

  static from(e: SupplierEntity): SupplierResponseDto {
    const d = new SupplierResponseDto();
    d.id = e.id;
    d.supplierNumber = e.supplierNumber;
    d.name = e.name;
    d.contactName = e.contactName;
    d.contactPhone = e.contactPhone;
    d.contactEmail = e.contactEmail;
    d.integrationMode = e.integrationMode;
    d.status = e.status;
    d.notes = e.notes;
    d.createdAt = e.createdAt.toISOString();
    d.updatedAt = e.updatedAt.toISOString();
    return d;
  }
}

export class SupplierAccountResponseDto {
  id: string;
  supplierId: string;
  status: string;
  totalPurchasedRial: string;
  totalPaidRial: string;
  outstandingRial: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;

  static from(row: {
    id: string;
    supplierId: string;
    status: string;
    totalPurchasedRial: Decimal | string | number | { toString(): string };
    totalPaidRial: Decimal | string | number | { toString(): string };
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): SupplierAccountResponseDto {
    const d = new SupplierAccountResponseDto();
    const purchased = new Decimal(row.totalPurchasedRial.toString());
    const paid = new Decimal(row.totalPaidRial.toString());
    d.id = row.id;
    d.supplierId = row.supplierId;
    d.status = row.status;
    d.totalPurchasedRial = purchased.toFixed(2);
    d.totalPaidRial = paid.toFixed(2);
    d.outstandingRial = purchased.minus(paid).toFixed(2);
    d.notes = row.notes;
    d.createdAt = row.createdAt.toISOString();
    d.updatedAt = row.updatedAt.toISOString();
    return d;
  }
}

/**
 * Supplier Service
 *
 * Manages Supplier (UpstreamProvider) and SupplierAccount.
 * docs/05-use-cases.md UC-13, UC-14
 * docs/04-actors-and-permissions.md — Accountant: supplier_account.manage
 *
 * MVP: Manual data entry only (§11.2).
 * API integration: future — integrationMode = API_FUTURE placeholder.
 */
@Injectable()
export class SupplierService {
  private readonly logger = new Logger(SupplierService.name);

  constructor(
    private readonly repo: SupplierRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createSupplier(
    input: {
      name: string;
      contactName?: string;
      contactPhone?: string;
      contactEmail?: string;
      notes?: string;
    },
    actorUserId: string,
  ): Promise<SupplierResponseDto> {
    const supplierNumber = await this.repo.nextSupplierNumber();

    // Check no name collision (not a hard unique but good practice)
    const existing = await this.prisma.supplier.findFirst({ where: { name: input.name } });
    if (existing) {
      throw new DuplicateSupplierNumberException(input.name);
    }

    const supplier = await this.prisma.$transaction(async (tx) => {
      const s = await tx.supplier.create({
        data: {
          supplierNumber,
          name: input.name,
          contactName: input.contactName ?? null,
          contactPhone: input.contactPhone ?? null,
          contactEmail: input.contactEmail ?? null,
          notes: input.notes ?? null,
          integrationMode: 'MANUAL',
          status: 'ACTIVE',
        },
      });
      // Auto-create SupplierAccount (1:1 per domain model)
      await tx.supplierAccount.create({
        data: { supplierId: s.id, totalPurchasedRial: 0, totalPaidRial: 0 },
      });
      return s;
    });

    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'SUPPLIER_CREATED',
      entityType: 'Supplier',
      entityId: supplier.id,
      after: { supplierNumber, name: input.name },
    });

    this.logger.log(`[SupplierService] Supplier created: ${supplier.id} (${supplierNumber})`);
    return SupplierResponseDto.from(this.repo['mapRow'](supplier));
  }

  async updateSupplier(
    id: string,
    input: Partial<{
      name: string;
      contactName: string;
      contactPhone: string;
      contactEmail: string;
      status: SupplierStatus;
      notes: string;
    }>,
    actorUserId: string,
  ): Promise<SupplierResponseDto> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new SupplierNotFoundException(id);

    const updated = await this.repo.update(id, input);

    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'SUPPLIER_UPDATED',
      entityType: 'Supplier',
      entityId: id,
      before: { name: existing.name, status: existing.status },
      after: input,
    });

    return SupplierResponseDto.from(updated);
  }

  async getSupplierById(id: string): Promise<SupplierResponseDto> {
    const s = await this.repo.findById(id);
    if (!s) throw new SupplierNotFoundException(id);
    return SupplierResponseDto.from(s);
  }

  async listSuppliers(opts: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<SupplierResponseDto[]> {
    const list = await this.repo.findAll(opts);
    return list.map(SupplierResponseDto.from);
  }

  async getSupplierAccount(supplierId: string): Promise<SupplierAccountResponseDto> {
    const supplier = await this.repo.findById(supplierId);
    if (!supplier) throw new SupplierNotFoundException(supplierId);
    const account = await this.repo.findAccountBySupplierId(supplierId);
    if (!account) throw new SupplierAccountNotFoundException(supplierId);
    return SupplierAccountResponseDto.from(account);
  }
}
