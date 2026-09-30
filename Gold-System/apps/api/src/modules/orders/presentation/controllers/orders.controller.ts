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
import { OrdersService } from '../../application/orders.service';
import {
  CustomerActivityQueryDto,
  CustomerActivityService,
} from '../../application/customer-activity.service';
import { CreateOrderDto } from '../../application/dto/create-order.dto';
import { CancelOrderDto } from '../../application/dto/cancel-order.dto';
import { RejectOrderDto } from '../../application/dto/reject-order.dto';
import { ApproveOrderDto } from '../../application/dto/approve-order.dto';
import { RequestRevisionDto } from '../../application/dto/request-revision.dto';
import { ListOrdersDto } from '../../application/dto/list-orders.dto';
import { QuotationsService } from '../../../quotations/application/quotations.service';

/**
 * Orders REST API.
 *
 * All endpoints require authentication (JwtAuthGuard at class level).
 *
 * Authorization model:
 *   - Customers: create/submit/cancel own orders; view own orders only
 *   - Staff with order.read: list all orders, view any order
 *   - Staff with order.cancel: cancel any order
 *   - Staff with order.reject: reject any order
 *
 * Customer isolation: customers NEVER see another customer's orders.
 * Enforced at service layer in addition to query-level scoping.
 *
 * docs/21-business-decisions.md §3.3, §3.4, §3.5, §4.1
 */
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly quotationsService: QuotationsService,
    private readonly activityService: CustomerActivityService,
  ) {}

  /**
   * POST /orders
   * Create a new DRAFT order.
   *
   * Calls the Pricing Engine to compute the order total.
   * No credit is reserved at this stage (credit reserved on submit).
   *
   * Authorization: any authenticated customer with ACTIVE status + approved KYC.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrder(@CurrentUser() user: CurrentUserData, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(user.userId, dto);
  }

  /**
   * POST /orders/:id/submit
   * Submit a DRAFT order (DRAFT → SUBMITTED).
   *
   * Triggers credit reservation. If insufficient credit, returns HTTP 422.
   * Credit reservation is atomic with the status update (no partial state).
   *
   * Authorization: customer must own the order.
   */
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  async submitOrder(@CurrentUser() user: CurrentUserData, @Param('id') orderId: string) {
    return this.ordersService.submitOrder(user.userId, orderId);
  }

  /**
   * POST /orders/:id/cancel
   * Cancel an order.
   *
   * Customer path: allowed only if store.allowCustomerCancellation = true (§4.1).
   * Staff path: requires 'order.cancel' permission; bypasses customer restriction.
   *
   * If order was SUBMITTED, credit is released atomically (§3.5).
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelOrder(
    @CurrentUser() user: CurrentUserData,
    @Param('id') orderId: string,
    @Body() dto: CancelOrderDto,
  ) {
    const isStaff = user.permissions.includes('order.cancel');
    return this.ordersService.cancelOrder(user.userId, orderId, dto, isStaff);
  }

  /**
   * POST /orders/:id/reject
   * Reject an order (staff/reviewer action).
   *
   * Phase 3.3: implements state transition and credit release.
   * Full Reviewer assignment workflow is Phase 3.4+.
   *
   * Authorization: requires 'order.reject' permission.
   */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions('order.reject')
  async rejectOrder(
    @CurrentUser() user: CurrentUserData,
    @Param('id') orderId: string,
    @Body() dto: RejectOrderDto,
  ) {
    return this.ordersService.rejectOrder(user.userId, orderId, dto);
  }

  /**
   * POST /orders/:id/approve
   * Approve an Order after manual review (ASSIGNED/UNDER_REVIEW → APPROVED).
   *
   * NOTE: Trade creation is a subsequent phase (Phase 3.6+, UC-11).
   * Credit is NOT consumed here — consumed at Trade approval (§3.3).
   *
   * DUAL APPROVAL: Single approval only (§13.4 OPEN — threshold undefined).
   *
   * Authorization: trade.approve (Reviewer)
   *
   * API deviation: API-ARCHITECTURE.md shows POST /trades/:id/approve.
   * No Trade exists in this phase; using /orders/:id/approve instead.
   */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions('trade.approve')
  async approveOrder(
    @CurrentUser() user: CurrentUserData,
    @Param('id') orderId: string,
    @Body() dto: ApproveOrderDto,
  ) {
    return this.ordersService.approveOrder(user.userId, orderId, dto);
  }

  /**
   * POST /orders/:id/request-revision
   * Request revision of an Order (ASSIGNED/UNDER_REVIEW → REVISION_REQUESTED).
   *
   * BLOCKER §8.3: The REVISION_REQUESTED → QUOTED path is NOT implemented.
   * The documentation does not define what can be modified after a revision request.
   * The mechanism for re-quotation is undefined.
   *
   * Authorization: trade.request_revision (Reviewer/Operator)
   *
   * API deviation: API-ARCHITECTURE.md shows POST /trades/:id/request-revision.
   * Using /orders/:id/request-revision instead (no Trade in this phase).
   */
  @Post(':id/request-revision')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions('trade.request_revision')
  async requestRevision(
    @CurrentUser() user: CurrentUserData,
    @Param('id') orderId: string,
    @Body() dto: RequestRevisionDto,
  ) {
    return this.ordersService.requestRevision(user.userId, orderId, dto);
  }

  /**
   * GET /orders
   * List orders.
   *
   * Customer: returns only own orders (no query params needed).
   * Staff with order.read: can filter by status, customerId.
   */
  /**
   * GET /orders/activity/summary
   * Booked buy/sell/volume for the authenticated customer.
   * Customer id is resolved from the session. Query customerId is not accepted.
   */
  @Get('activity/summary')
  async activitySummary(
    @CurrentUser() user: CurrentUserData,
    @Query() query: CustomerActivityQueryDto,
  ) {
    return this.activityService.summary(user.userId, query);
  }

  /**
   * GET /orders/activity
   * Paginated transactions for the same customer and filters as the summary.
   */
  @Get('activity')
  async activityList(
    @CurrentUser() user: CurrentUserData,
    @Query() query: CustomerActivityQueryDto,
  ) {
    return this.activityService.list(user.userId, query);
  }

  @Get()
  async listOrders(@CurrentUser() user: CurrentUserData, @Query() query: ListOrdersDto) {
    const isStaff = user.permissions.includes('order.read');
    return this.ordersService.listOrders(user.userId, query, isStaff);
  }

  /**
   * GET /orders/:id/quotations
   * Get all Quotations for a specific Order.
   *
   * API-ARCHITECTURE.md: GET /orders/:id/quotations
   *
   * Customer: only their own order's quotations.
   * Staff with quotation.read: any order's quotations.
   */
  @Get(':id/quotations')
  @HttpCode(HttpStatus.OK)
  async getOrderQuotations(@CurrentUser() user: CurrentUserData, @Param('id') orderId: string) {
    const isStaff = user.permissions.includes('quotation.read');
    return this.quotationsService.getQuotationsForOrder(orderId, user.userId, isStaff);
  }

  /**
   * GET /orders/:id
   * Get order detail.
   *
   * Customer: only own orders — returns 404 (not 403) for another customer's order
   * to prevent enumeration. Enforced at service layer.
   * Staff with order.read: any order.
   */
  /**
   * GET /orders/:id/activity
   * One transaction for the detail page. Customers only receive their own order.
   */
  @Get(':id/activity')
  async activityDetail(@CurrentUser() user: CurrentUserData, @Param('id') orderId: string) {
    const isStaff = user.permissions.includes('order.read');
    return this.activityService.detail(user.userId, orderId, isStaff);
  }

  @Get(':id')
  async getOrderDetail(@CurrentUser() user: CurrentUserData, @Param('id') orderId: string) {
    const isStaff = user.permissions.includes('order.read');
    return this.ordersService.getOrderDetail(user.userId, orderId, isStaff);
  }
}
