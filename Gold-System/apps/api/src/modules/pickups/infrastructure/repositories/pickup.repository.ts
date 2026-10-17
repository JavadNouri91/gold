import { Injectable } from '@nestjs/common';
import { Prisma, PhysicalGoldPickupStatus as PrismaPickupStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../../database/prisma.service';
import { PhysicalGoldPickupStatus } from '../../domain/constants/pickup-states';
import {
  PhysicalGoldPickupEntity,
  PickupEventSnapshot,
} from '../../domain/entities/pickup.entity';

const pickupInclude = {
  events: { orderBy: { createdAt: 'asc' as const } },
  customer: {
    select: {
      id: true,
      userId: true,
      customerNumber: true,
      firstName: true,
      lastName: true,
      mobile: true,
    },
  },
} satisfies Prisma.PhysicalGoldPickupInclude;

type PickupRow = Prisma.PhysicalGoldPickupGetPayload<{
  include: typeof pickupInclude;
}>;

type PickupExtraColumns = {
  id: string;
  cancelled_by_kind: string | null;
  scheduled_pickup_at: Date | null;
};

function normalizeCancelledByKind(
  value: string | null | undefined,
): 'CUSTOMER' | 'STAFF' | null {
  return value === 'CUSTOMER' || value === 'STAFF' ? value : null;
}

/** Prefer stored kind; otherwise infer from who cancelled vs the customer login. */
function resolveCancelledByKind(
  stored: string | null | undefined,
  cancelledById: string | null,
  customerUserId: string | null | undefined,
): 'CUSTOMER' | 'STAFF' | null {
  const normalized = normalizeCancelledByKind(stored);
  if (normalized) return normalized;
  if (!cancelledById) return null;
  if (customerUserId && cancelledById === customerUserId) return 'CUSTOMER';
  return 'STAFF';
}

@Injectable()
export class PickupRepository {
  constructor(private readonly prisma: PrismaService) {}

  async nextPickupNumber(tx: Prisma.TransactionClient): Promise<string> {
    const count = await tx.physicalGoldPickup.count();
    return `PKP-${String(count + 1).padStart(6, '0')}`;
  }

  async findById(id: string): Promise<PhysicalGoldPickupEntity | null> {
    const row = await this.prisma.physicalGoldPickup.findUnique({
      where: { id },
      include: pickupInclude,
    });
    if (!row) return null;
    const extras = await this.loadExtras(this.prisma, [id]);
    return this.mapRow(row, extras.get(id));
  }

  async findByIdForCustomer(
    id: string,
    customerId: string,
  ): Promise<PhysicalGoldPickupEntity | null> {
    const row = await this.prisma.physicalGoldPickup.findFirst({
      where: { id, customerId },
      include: pickupInclude,
    });
    if (!row) return null;
    const extras = await this.loadExtras(this.prisma, [id]);
    return this.mapRow(row, extras.get(id));
  }

  async listForCustomer(
    customerId: string,
    opts?: { status?: PhysicalGoldPickupStatus; limit?: number; offset?: number },
  ): Promise<{ items: PhysicalGoldPickupEntity[]; total: number }> {
    const where: Prisma.PhysicalGoldPickupWhereInput = {
      customerId,
      ...(opts?.status ? { status: opts.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.physicalGoldPickup.findMany({
        where,
        include: pickupInclude,
        orderBy: { requestedAt: 'desc' },
        take: opts?.limit ?? 50,
        skip: opts?.offset ?? 0,
      }),
      this.prisma.physicalGoldPickup.count({ where }),
    ]);
    const extras = await this.loadExtras(
      this.prisma,
      rows.map((r) => r.id),
    );
    return { items: rows.map((r) => this.mapRow(r, extras.get(r.id))), total };
  }

  async listStaff(opts: {
    status?: PhysicalGoldPickupStatus;
    customerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: PhysicalGoldPickupEntity[]; total: number }> {
    const where: Prisma.PhysicalGoldPickupWhereInput = {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.customerId ? { customerId: opts.customerId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.physicalGoldPickup.findMany({
        where,
        include: pickupInclude,
        orderBy: { requestedAt: 'desc' },
        take: opts.limit ?? 50,
        skip: opts.offset ?? 0,
      }),
      this.prisma.physicalGoldPickup.count({ where }),
    ]);
    const extras = await this.loadExtras(
      this.prisma,
      rows.map((r) => r.id),
    );
    return { items: rows.map((r) => this.mapRow(r, extras.get(r.id))), total };
  }

  async createInTx(
    tx: Prisma.TransactionClient,
    input: {
      pickupNumber: string;
      customerId: string;
      storeId: string;
      weightGrams: Decimal;
      purityRatio: Decimal;
      customerNote: string | null;
      actorId: string;
    },
  ): Promise<PhysicalGoldPickupEntity> {
    const row = await tx.physicalGoldPickup.create({
      data: {
        pickupNumber: input.pickupNumber,
        customerId: input.customerId,
        storeId: input.storeId,
        weightGrams: input.weightGrams.toFixed(6),
        purityRatio: input.purityRatio.toFixed(6),
        status: 'REQUESTED',
        customerNote: input.customerNote,
        events: {
          create: {
            status: 'REQUESTED',
            note: input.customerNote,
            actorId: input.actorId,
          },
        },
      },
      include: pickupInclude,
    });
    return this.mapRow(row);
  }

  async transitionInTx(
    tx: Prisma.TransactionClient,
    input: {
      id: string;
      toStatus: PhysicalGoldPickupStatus;
      actorId: string;
      staffNote?: string | null;
      cancelReason?: string | null;
      cancelledByKind?: 'CUSTOMER' | 'STAFF' | null;
      scheduledPickupAt?: Date | null;
    },
  ): Promise<PhysicalGoldPickupEntity> {
    const now = new Date();
    const data: Prisma.PhysicalGoldPickupUpdateInput = {
      status: input.toStatus as PrismaPickupStatus,
    };

    if (input.staffNote !== undefined) {
      data.staffNote = input.staffNote;
    }

    switch (input.toStatus) {
      case PhysicalGoldPickupStatus.PREPARING:
        data.preparingAt = now;
        data.preparingBy = { connect: { id: input.actorId } };
        break;
      case PhysicalGoldPickupStatus.READY:
        data.readyAt = now;
        data.readyBy = { connect: { id: input.actorId } };
        break;
      case PhysicalGoldPickupStatus.DELIVERED:
        data.deliveredAt = now;
        data.deliveredBy = { connect: { id: input.actorId } };
        break;
      case PhysicalGoldPickupStatus.CANCELLED:
        data.cancelledAt = now;
        data.cancelledBy = { connect: { id: input.actorId } };
        data.cancelReason = input.cancelReason ?? null;
        break;
      default:
        break;
    }

    const row = await tx.physicalGoldPickup.update({
      where: { id: input.id },
      data: {
        ...data,
        events: {
          create: {
            status: input.toStatus as PrismaPickupStatus,
            note: input.cancelReason ?? input.staffNote ?? null,
            actorId: input.actorId,
          },
        },
      },
      include: pickupInclude,
    });

    // Columns added after last prisma generate — write via SQL until client is regenerated.
    if (input.toStatus === PhysicalGoldPickupStatus.PREPARING && input.scheduledPickupAt) {
      await tx.$executeRaw`
        UPDATE physical_gold_pickups
        SET scheduled_pickup_at = ${input.scheduledPickupAt}
        WHERE id = ${input.id}
      `;
    }
    if (input.toStatus === PhysicalGoldPickupStatus.CANCELLED) {
      await tx.$executeRaw`
        UPDATE physical_gold_pickups
        SET cancelled_by_kind = ${input.cancelledByKind ?? null}
        WHERE id = ${input.id}
      `;
    }

    const extras = await this.loadExtras(tx, [input.id]);
    return this.mapRow(row, extras.get(input.id));
  }

  private async loadExtras(
    db: PrismaService | Prisma.TransactionClient,
    ids: string[],
  ): Promise<Map<string, PickupExtraColumns>> {
    const map = new Map<string, PickupExtraColumns>();
    if (ids.length === 0) return map;
    const rows = await db.$queryRaw<PickupExtraColumns[]>`
      SELECT id, cancelled_by_kind, scheduled_pickup_at
      FROM physical_gold_pickups
      WHERE id IN (${Prisma.join(ids)})
    `;
    for (const row of rows) {
      map.set(row.id, row);
    }
    return map;
  }

  private mapRow(
    row: PickupRow,
    extras?: PickupExtraColumns,
  ): PhysicalGoldPickupEntity {
    const events: PickupEventSnapshot[] = row.events.map((e) => ({
      id: e.id,
      status: e.status as PhysicalGoldPickupStatus,
      note: e.note,
      actorId: e.actorId,
      createdAt: e.createdAt,
    }));
    return new PhysicalGoldPickupEntity({
      id: row.id,
      pickupNumber: row.pickupNumber,
      customerId: row.customerId,
      storeId: row.storeId,
      weightGrams: row.weightGrams,
      purityRatio: row.purityRatio,
      status: row.status as PhysicalGoldPickupStatus,
      customerNote: row.customerNote,
      staffNote: row.staffNote,
      cancelReason: row.cancelReason,
      cancelledByKind: resolveCancelledByKind(
        extras?.cancelled_by_kind,
        row.cancelledById,
        row.customer?.userId,
      ),
      scheduledPickupAt: extras?.scheduled_pickup_at ?? null,
      requestedAt: row.requestedAt,
      preparingAt: row.preparingAt,
      readyAt: row.readyAt,
      deliveredAt: row.deliveredAt,
      cancelledAt: row.cancelledAt,
      preparingById: row.preparingById,
      readyById: row.readyById,
      deliveredById: row.deliveredById,
      cancelledById: row.cancelledById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      events,
      customer: row.customer
        ? {
            id: row.customer.id,
            customerNumber: row.customer.customerNumber,
            firstName: row.customer.firstName,
            lastName: row.customer.lastName,
            mobile: row.customer.mobile,
          }
        : null,
    });
  }
}
