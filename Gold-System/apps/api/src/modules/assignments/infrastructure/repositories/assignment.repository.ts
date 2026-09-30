import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AssignmentStatus } from '@gold/shared-types';
import { PrismaService } from '../../../../database/prisma.service';
import { AssignmentEntity } from '../../domain/entities/assignment.entity';

type AssignmentRow = Prisma.AssignmentGetPayload<Record<string, never>>;

@Injectable()
export class AssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Reads ───────────────────────────────────────────────────

  async findById(id: string): Promise<AssignmentEntity | null> {
    const row = await this.prisma.assignment.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findActiveForOrder(orderId: string): Promise<AssignmentEntity | null> {
    const row = await this.prisma.assignment.findFirst({
      where: { orderId, status: 'ACTIVE' },
    });
    return row ? this.toDomain(row) : null;
  }

  async findByOrderId(orderId: string): Promise<AssignmentEntity[]> {
    const rows = await this.prisma.assignment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findByAssignedTo(
    assignedToId: string,
    opts: { page: number; limit: number; status?: AssignmentStatus },
  ): Promise<{ assignments: AssignmentEntity[]; total: number }> {
    const skip = (opts.page - 1) * opts.limit;
    const where: Prisma.AssignmentWhereInput = { assignedToId };
    if (opts.status) where.status = opts.status;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assignment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: opts.limit,
      }),
      this.prisma.assignment.count({ where }),
    ]);

    return { assignments: rows.map((r) => this.toDomain(r)), total };
  }

  // ─── Writes ──────────────────────────────────────────────────

  /**
   * Creates a new Assignment inside an existing Prisma transaction.
   * Used atomically with cancelling any existing active assignment.
   */
  async createInTx(
    tx: Prisma.TransactionClient,
    data: {
      orderId: string;
      quotationId: string | null;
      assignedToId: string;
      assignedById: string;
      notes: string | null;
    },
  ): Promise<AssignmentEntity> {
    const row = await tx.assignment.create({
      data: {
        orderId: data.orderId,
        quotationId: data.quotationId,
        assignedToId: data.assignedToId,
        assignedById: data.assignedById,
        status: 'ACTIVE',
        notes: data.notes,
        updatedAt: new Date(),
      },
    });
    return this.toDomain(row);
  }

  /**
   * Cancels all ACTIVE assignments for an Order (used on reassignment or cancellation).
   * Returns the number of assignments cancelled.
   */
  async cancelActiveForOrderInTx(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
    const result = await tx.assignment.updateMany({
      where: { orderId, status: 'ACTIVE' },
      data: { status: 'CANCELLED', completedAt: new Date(), updatedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Completes all ACTIVE assignments for an Order (review decision reached).
   * Returns the number of assignments completed.
   */
  async completeActiveForOrderInTx(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
    const result = await tx.assignment.updateMany({
      where: { orderId, status: 'ACTIVE' },
      data: { status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() },
    });
    return result.count;
  }

  // ─── Domain mapping ───────────────────────────────────────────

  private toDomain(row: AssignmentRow): AssignmentEntity {
    return new AssignmentEntity({
      id: row.id,
      orderId: row.orderId,
      quotationId: row.quotationId,
      assignedToId: row.assignedToId,
      assignedById: row.assignedById,
      status: row.status as AssignmentStatus,
      notes: row.notes,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
