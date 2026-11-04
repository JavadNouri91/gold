import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUser, CurrentUserData } from '../../../../common/decorators/current-user.decorator';
import { OrdersService } from '../../application/orders.service';
import { RejectOrderDto } from '../../application/dto/reject-order.dto';

@Controller('staff/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaffOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('order.reject')
  reject(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: RejectOrderDto,
  ) {
    return this.orders.rejectOrder(user.userId, id, dto);
  }
}
