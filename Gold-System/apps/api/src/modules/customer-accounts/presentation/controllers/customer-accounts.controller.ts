import { Controller, Get, Post, Body, Param, Req, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { CustomerAccountsService } from '../../application/customer-accounts.service';
import { GrantCreditDto } from '../../application/dto/grant-credit.dto';
import { RequirePermissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUser, CurrentUserData } from '../../../../common/decorators/current-user.decorator';

@ApiTags('customer-accounts')
@ApiBearerAuth()
@Controller('customers')
export class CustomerAccountsController {
  constructor(private readonly service: CustomerAccountsService) {}

  // ----------------------------------------------------------------
  // Customer: get own account — "GET /customers/me/account"
  // ----------------------------------------------------------------
  @Get('me/account')
  @ApiOperation({ summary: 'Get own customer account (credit balances)' })
  getMyAccount(@CurrentUser() user: CurrentUserData) {
    return this.service.findByUserId(user.userId);
  }

  @Get('me/account/transactions')
  @ApiOperation({ summary: 'List own credit ledger entries' })
  listMyTransactions(@CurrentUser() user: CurrentUserData, @Query('limit') limit?: string) {
    const parsed = limit == null || limit === '' ? 20 : Number(limit);
    return this.service.listMyTransactions(user.userId, parsed);
  }

  // ----------------------------------------------------------------
  // Staff: get customer account by customer ID
  // ----------------------------------------------------------------
  @Get(':customerId/account')
  @RequirePermissions('customer.account.read')
  @ApiOperation({ summary: 'Get customer account by customer ID (staff)' })
  findByCustomerId(@Param('customerId') customerId: string) {
    return this.service.findByCustomerId(customerId);
  }

  // ----------------------------------------------------------------
  // UC-05: Grant credit (Manager)
  // BR-C04: actor and reason required
  // ----------------------------------------------------------------
  @Post(':customerId/account/credit')
  @RequirePermissions('credit.manage')
  @ApiOperation({
    summary: 'UC-05: Grant/add credit to customer — BR-C04 audited',
  })
  grantCredit(
    @Param('customerId') customerId: string,
    @Body() dto: GrantCreditDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.service.grantCredit(customerId, dto, user.userId, req.ip ?? undefined);
  }
}
