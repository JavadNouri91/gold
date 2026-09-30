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
import { TradesService } from '../../application/trades.service';
import { ConfirmTradeDto } from '../../application/dto/confirm-trade.dto';
import { ReverseTradeDto } from '../../application/dto/reverse-trade.dto';
import { ListTradesDto } from '../../application/dto/list-trades.dto';

/**
 * Trades REST API — Phase 3.6
 *
 * Endpoints:
 *   POST   /trades              — Confirm Trade from APPROVED Order (trade.approve)
 *   GET    /trades              — List Trades (staff: all; customer: own)
 *   GET    /trades/:id          — Get Trade by ID (staff: any; customer: own only)
 *   POST   /trades/:id/reverse  — Reverse CONFIRMED Trade (trade.approve)
 *
 * Authorization:
 *   - trade.approve: required for confirmation and reversal
 *   - Customer: can only view own Trades (enforced at service + repository level)
 *
 * Customer isolation:
 *   Customers NEVER see another customer's Trades.
 *   Returns 404 (not 403) for unauthorized Trade access — prevents enumeration.
 *   Enforced at service layer AND repository query level.
 *
 * IMMUTABILITY (BR-T02):
 *   Confirmed Trade financial fields are never updated via API.
 *   Corrections use POST /trades/:id/reverse only.
 *
 * docs/21-business-decisions.md §3.3, §4.2
 * architecture/STATE-MACHINES.md
 */
@UseGuards(JwtAuthGuard)
@Controller('trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  /**
   * POST /trades
   * Confirm a Trade from an APPROVED Order.
   *
   * Atomically:
   *   1. Creates Trade (CONFIRMED) from locked Quotation terms
   *   2. Moves credit: reserved → consumed (§3.3)
   *   3. Transitions Order: APPROVED → TRADE_CREATED
   *   4. Transitions Quotation: ACTIVE → CONVERTED
   *
   * Concurrency: duplicate confirmations are prevented by:
   *   - orderId unique constraint on Trade table
   *   - SELECT FOR UPDATE on credit account
   *   - Fresh Order status re-read inside transaction
   *
   * Permission: trade.approve
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PermissionsGuard)
  @RequirePermissions('trade.approve')
  async confirmTrade(@CurrentUser() user: CurrentUserData, @Body() dto: ConfirmTradeDto) {
    return this.tradesService.confirmTrade(user.userId, dto);
  }

  /**
   * GET /trades
   * List Trades.
   *
   * Staff (with trade.read permission): all Trades, optional status filter.
   * Customer: only own Trades (service resolves customerId from userId).
   *
   * Customer isolation enforced at service + repository level.
   */
  @Get()
  async listTrades(@CurrentUser() user: CurrentUserData, @Query() dto: ListTradesDto) {
    const isStaff = user.permissions.includes('trade.read');
    return this.tradesService.listTrades(user.userId, dto, isStaff);
  }

  /**
   * GET /trades/:id
   * Get a single Trade by ID.
   *
   * Staff: any Trade.
   * Customer: only own Trades (returns 404 for others — prevents enumeration).
   */
  @Get(':id')
  async getTrade(@CurrentUser() user: CurrentUserData, @Param('id') tradeId: string) {
    const isStaff = user.permissions.includes('trade.read');
    return this.tradesService.getTrade(user.userId, tradeId, isStaff);
  }

  /**
   * POST /trades/:id/reverse
   * Reverse a CONFIRMED Trade (exceptional circumstances only).
   *
   * §4.2: Manager authorization required.
   * §4.2: Documented reason is mandatory.
   * Credit: consumedCreditRial -= trade.totalAmountRial (back to available)
   *
   * NOTE: Financial/Gold Ledger reversal is Phase 4 (deferred).
   *
   * Permission: trade.approve (Manager-level)
   */
  @Post(':id/reverse')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions('trade.approve')
  async reverseTrade(
    @CurrentUser() user: CurrentUserData,
    @Param('id') tradeId: string,
    @Body() dto: ReverseTradeDto,
  ) {
    return this.tradesService.reverseTrade(user.userId, tradeId, dto);
  }
}
