import { Injectable, Logger } from '@nestjs/common';
import { AssignmentStatus, OrderStatus } from '@gold/shared-types';

import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { OrderRepository } from '../../orders/infrastructure/repositories/order.repository';
import { QuotationRepository } from '../../quotations/infrastructure/repositories/quotation.repository';
import { AssignmentRepository } from '../infrastructure/repositories/assignment.repository';

import { AssignOrderDto } from './dto/assign-order.dto';
import { AssignmentResponseDto, ReviewContextDto } from './dto/assignment-response.dto';
import { AssignmentEntity } from '../domain/entities/assignment.entity';

import {
  OrderNotAssignableException,
  OrderNotUnderReviewException,
} from '../domain/exceptions/assignment.exceptions';
import { OrderNotFoundException } from '../../orders/domain/exceptions/order.exceptions';

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignmentRepo: AssignmentRepository,
    private readonly orderRepo: OrderRepository,
    private readonly quotationRepo: QuotationRepository,
    private readonly audit: AuditService,
  ) {}

  // ─── UC-09: Assign / Reassign Order ──────────────────────────

  /**
   * Assigns a QUOTED Order to a staff member for manual review.
   *
   * If an ACTIVE assignment already exists for this Order, it is
   * CANCELLED and a new ACTIVE assignment is created (reassignment).
   * All changes are atomic (single transaction).
   *
   * State transition: Order QUOTED → ASSIGNED
   *
   * BUSINESS RULES:
   *   - Only QUOTED orders can be assigned (state machine: QUOTED → ASSIGNED)
   *   - Only one ACTIVE assignment per Order at any time
   *   - Every assignment action is audited
   *
   * docs/05-use-cases.md UC-09
   * docs/04-actors-and-permissions.md: order.assign permission
   */
  async createAssignment(
    assignerUserId: string,
    orderId: string,
    dto: AssignOrderDto,
  ): Promise<AssignmentResponseDto> {
    // ── 1. Load Order ─────────────────────────────────────────────
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new OrderNotFoundException(orderId);

    // ── 2. Validate state: only QUOTED orders can be assigned ──────
    if (order.status !== OrderStatus.QUOTED) {
      throw new OrderNotAssignableException(orderId, order.status);
    }

    // ── 3. Find active Quotation for assignment context ────────────
    const activeQuotations = await this.quotationRepo.findByOrderId(orderId);
    const activeQuotation = activeQuotations.find((q) => q.status === 'ACTIVE') ?? null;

    // ── 4. Atomic: cancel any existing ACTIVE assignment + create new + transition Order ──
    const isReassignment = !!(await this.assignmentRepo.findActiveForOrder(orderId));

    const assignment = await this.prisma.$transaction(async (tx) => {
      // Cancel existing active assignment (if any — reassignment)
      if (isReassignment) {
        await this.assignmentRepo.cancelActiveForOrderInTx(tx, orderId);
      }

      // Create new ACTIVE assignment
      const created = await this.assignmentRepo.createInTx(tx, {
        orderId,
        quotationId: activeQuotation?.id ?? null,
        assignedToId: dto.assignedToUserId,
        assignedById: assignerUserId,
        notes: dto.notes ?? null,
      });

      // Transition Order: QUOTED → ASSIGNED
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'ASSIGNED', updatedAt: new Date() },
      });

      return created;
    });

    // ── 5. Audit ──────────────────────────────────────────────────
    await this.audit.log({
      actorId: assignerUserId,
      actorType: 'USER',
      action: isReassignment ? 'ORDER_REASSIGNED' : 'ORDER_ASSIGNED',
      entityType: 'Assignment',
      entityId: assignment.id,
      after: {
        orderId,
        assignedToId: dto.assignedToUserId,
        quotationId: activeQuotation?.id ?? null,
        notes: dto.notes ?? null,
        isReassignment,
      },
    });

    await this.audit.log({
      actorId: assignerUserId,
      actorType: 'USER',
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'Order',
      entityId: orderId,
      before: { status: OrderStatus.QUOTED },
      after: { status: OrderStatus.ASSIGNED, assignedToId: dto.assignedToUserId },
    });

    this.logger.log(
      `Order ${order.orderNumber} ${isReassignment ? 'reassigned' : 'assigned'} ` +
        `to user ${dto.assignedToUserId} by ${assignerUserId}`,
    );

    return this.toResponse(assignment);
  }

  /**
   * Transitions an ASSIGNED Order to UNDER_REVIEW.
   *
   * Called when a Reviewer explicitly starts reviewing an assigned Order.
   * This transition is required by the state machine:
   *   ASSIGNED → UNDER_REVIEW → (APPROVED | REJECTED | REVISION_REQUESTED)
   *
   * BUSINESS RULE:
   *   Only the assigned reviewer (or staff with trade.review) may start the review.
   *   We do not enforce assignee identity at this layer — the Permission Guard
   *   ensures the caller has trade.review permission.
   *
   * docs/05-use-cases.md UC-10: "View information → Review → Decide"
   */
  async startReview(reviewerUserId: string, orderId: string): Promise<void> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new OrderNotFoundException(orderId);

    if (order.status !== OrderStatus.ASSIGNED) {
      throw new OrderNotUnderReviewException(orderId, order.status);
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'UNDER_REVIEW', updatedAt: new Date() },
    });

    await this.audit.log({
      actorId: reviewerUserId,
      actorType: 'USER',
      action: 'ORDER_REVIEW_STARTED',
      entityType: 'Order',
      entityId: orderId,
      before: { status: OrderStatus.ASSIGNED },
      after: { status: OrderStatus.UNDER_REVIEW, reviewerUserId },
    });

    this.logger.log(`Review started for Order ${orderId} by user ${reviewerUserId}`);
  }

  // ─── UC-10: Full Review Context ───────────────────────────────

  /**
   * Returns the full review context for a staff reviewer.
   *
   * Includes:
   *   - Order details + items
   *   - Customer profile + type + KYC status
   *   - Active Quotation + pricing snapshot
   *   - Reserved credit + account status
   *   - Active assignment
   *
   * CUSTOMER VISIBILITY: Staff-only. This data MUST NOT be exposed
   * to customer-facing endpoints.
   *
   * docs/05-use-cases.md UC-10
   */
  async getReviewContext(orderId: string): Promise<ReviewContextDto> {
    // Load Order with full context
    const orderRow = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          include: {
            account: true,
            kycVerifications: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
        quotations: {
          where: { status: 'ACTIVE' },
          orderBy: { version: 'desc' },
          take: 1,
        },
        assignments: {
          where: { status: 'ACTIVE' },
          take: 1,
        },
      },
    });

    if (!orderRow) throw new OrderNotFoundException(orderId);

    const customer = orderRow.customer;
    const account = customer?.account ?? null;
    const latestKyc = customer?.kycVerifications[0] ?? null;
    const activeQuotation = orderRow.quotations[0] ?? null;
    const activeAssignment = orderRow.assignments[0] ?? null;

    const availableCreditRial = account
      ? account.creditLimitRial.minus(account.reservedCreditRial).minus(account.consumedCreditRial)
      : null;

    const dto = new ReviewContextDto();

    dto.order = {
      id: orderRow.id,
      orderNumber: orderRow.orderNumber,
      status: orderRow.status,
      totalAmountRial: orderRow.totalAmountRial.toFixed(2),
      reservedAmountRial: orderRow.reservedAmountRial.toFixed(2),
      weightGrams: orderRow.weightGrams.toFixed(6),
      purityRatio: orderRow.purityRatio.toFixed(6),
      customerType: orderRow.customerType,
      submittedAt: orderRow.submittedAt,
      createdAt: orderRow.createdAt,
    };

    dto.customer = {
      id: customer?.id ?? '',
      customerNumber: customer?.customerNumber ?? '',
      firstName: customer?.firstName ?? '',
      lastName: customer?.lastName ?? '',
      nationalId: customer?.nationalId ?? '',
      mobile: customer?.mobile ?? '',
      type: customer?.type ?? null,
      status: customer?.status ?? '',
      kycStatus: latestKyc?.status ?? null,
    };

    dto.account = account
      ? {
          id: account.id,
          status: account.status,
          creditLimitRial: account.creditLimitRial.toFixed(2),
          reservedCreditRial: account.reservedCreditRial.toFixed(2),
          consumedCreditRial: account.consumedCreditRial.toFixed(2),
          availableCreditRial: availableCreditRial!.toFixed(2),
        }
      : null;

    dto.quotation = activeQuotation
      ? {
          id: activeQuotation.id,
          quotationNumber: activeQuotation.quotationNumber,
          version: activeQuotation.version,
          status: activeQuotation.status,
          totalAmountRial: activeQuotation.totalAmountRial.toFixed(2),
          weightGrams: activeQuotation.weightGrams.toFixed(6),
          purityRatio: activeQuotation.purityRatio.toFixed(6),
          step1BasePrice: activeQuotation.step1BasePrice?.toFixed(6) ?? null,
          wageAmount: activeQuotation.wageAmount?.toFixed(2) ?? null,
          discountAmount: activeQuotation.discountAmount?.toFixed(2) ?? null,
          roundingAmount: activeQuotation.roundingAmount?.toFixed(2) ?? null,
          isComplete: activeQuotation.isComplete,
          documentKey: activeQuotation.documentKey,
          generatedAt: activeQuotation.generatedAt,
        }
      : null;

    dto.activeAssignment = activeAssignment
      ? {
          id: activeAssignment.id,
          orderId: activeAssignment.orderId,
          quotationId: activeAssignment.quotationId,
          assignedToId: activeAssignment.assignedToId,
          assignedById: activeAssignment.assignedById,
          status: activeAssignment.status as AssignmentStatus,
          notes: activeAssignment.notes,
          completedAt: activeAssignment.completedAt,
          createdAt: activeAssignment.createdAt,
          updatedAt: activeAssignment.updatedAt,
        }
      : null;

    return dto;
  }

  // ─── Queries ──────────────────────────────────────────────────

  /**
   * Lists Assignments for a staff reviewer (their assigned work queue).
   * Staff with order.assign can see all assignments.
   */
  async listAssignments(
    actorUserId: string,
    isManager: boolean,
    opts: { page: number; limit: number; status?: AssignmentStatus },
  ): Promise<{
    assignments: AssignmentResponseDto[];
    total: number;
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    // Managers can see all; reviewers see their own assignments
    const assignedToId = isManager ? undefined : actorUserId;

    const page = opts.page;
    const limit = opts.limit;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (assignedToId) where.assignedToId = assignedToId;
    if (opts.status) where.status = opts.status;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assignment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.assignment.count({ where }),
    ]);

    const assignments = rows.map((r) =>
      this.toResponse(
        new AssignmentEntity({
          id: r.id,
          orderId: r.orderId,
          quotationId: r.quotationId,
          assignedToId: r.assignedToId,
          assignedById: r.assignedById,
          status: r.status as AssignmentStatus,
          notes: r.notes,
          completedAt: r.completedAt,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }),
      ),
    );

    return {
      assignments,
      total,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Private helpers ──────────────────────────────────────────

  private toResponse(assignment: AssignmentEntity): AssignmentResponseDto {
    const dto = new AssignmentResponseDto();
    dto.id = assignment.id;
    dto.orderId = assignment.orderId;
    dto.quotationId = assignment.quotationId;
    dto.assignedToId = assignment.assignedToId;
    dto.assignedById = assignment.assignedById;
    dto.status = assignment.status;
    dto.notes = assignment.notes;
    dto.completedAt = assignment.completedAt;
    dto.createdAt = assignment.createdAt;
    dto.updatedAt = assignment.updatedAt;
    return dto;
  }
}
