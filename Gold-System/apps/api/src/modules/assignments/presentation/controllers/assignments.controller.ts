import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUser, CurrentUserData } from '../../../../common/decorators/current-user.decorator';
import { AssignmentsService } from '../../application/assignments.service';
import { AssignOrderDto } from '../../application/dto/assign-order.dto';
import { AssignmentStatus } from '@gold/shared-types';

/**
 * Assignments REST API — Phase 3.5
 *
 * All endpoints require authentication.
 * All endpoints are staff-only. Customers MUST NOT access any assignment data.
 *
 * Authorization model:
 *   - order.assign    → Operator: can assign and reassign Orders
 *   - trade.review    → Reviewer: can start review, view review context
 *   - trade.approve   → Reviewer: can approve Orders
 *   - trade.reject    → Reviewer: can reject Orders
 *   - trade.request_revision → Reviewer: can request revision
 *
 * docs/04-actors-and-permissions.md
 * docs/05-use-cases.md UC-09, UC-10
 */
@UseGuards(JwtAuthGuard)
@Controller()
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  /**
   * POST /orders/:id/assign
   *
   * Assigns a QUOTED Order to a staff member for manual review.
   * If already assigned (ACTIVE), this is a reassignment — the previous
   * active assignment is cancelled atomically.
   *
   * State transition: QUOTED → ASSIGNED
   *
   * Authorization: order.assign (Operator / Manager)
   *
   * API-ARCHITECTURE.md: POST /orders/:id/assign
   */
  @Post('orders/:id/assign')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PermissionsGuard)
  @RequirePermissions('order.assign')
  async assignOrder(
    @CurrentUser() user: CurrentUserData,
    @Param('id') orderId: string,
    @Body() dto: AssignOrderDto,
  ) {
    return this.assignmentsService.createAssignment(user.userId, orderId, dto);
  }

  /**
   * POST /orders/:id/start-review
   *
   * Transitions an ASSIGNED Order to UNDER_REVIEW.
   * Called when the assigned reviewer begins actively reviewing.
   *
   * State transition: ASSIGNED → UNDER_REVIEW
   *
   * Authorization: trade.review (Reviewer / Seller / Operator)
   *
   * Note: Not in API-ARCHITECTURE.md but required by STATE-MACHINES.md
   * to achieve the ASSIGNED → UNDER_REVIEW transition.
   */
  @Post('orders/:id/start-review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions('trade.review')
  async startReview(@CurrentUser() user: CurrentUserData, @Param('id') orderId: string) {
    await this.assignmentsService.startReview(user.userId, orderId);
    return { message: 'Review started', orderId };
  }

  /**
   * GET /orders/:id/review-context
   *
   * Returns the full review context for a staff reviewer.
   *
   * Includes: Order, Customer, KYC status, Quotation, pricing snapshot,
   * reserved credit, account info, and active assignment.
   *
   * CUSTOMER VISIBILITY: Staff-only. Must NOT be exposed to customers.
   *
   * Authorization: trade.review (Reviewer / Seller / Operator)
   */
  @Get('orders/:id/review-context')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('trade.review')
  async getReviewContext(@Param('id') orderId: string) {
    return this.assignmentsService.getReviewContext(orderId);
  }

  /**
   * GET /assignments
   *
   * Lists Assignments.
   *
   * Staff with order.assign: can see all assignments.
   * Staff with only trade.review: sees their own assigned work queue.
   *
   * Authorization: trade.review OR order.assign
   */
  @Get('assignments')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('trade.review')
  async listAssignments(
    @CurrentUser() user: CurrentUserData,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: AssignmentStatus,
  ) {
    const isManager = user.permissions.includes('order.assign');
    return this.assignmentsService.listAssignments(user.userId, isManager, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      status,
    });
  }
}
