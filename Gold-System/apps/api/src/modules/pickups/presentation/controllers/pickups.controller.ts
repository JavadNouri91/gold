import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUser, CurrentUserData } from '../../../../common/decorators/current-user.decorator';
import { requireActorId } from '../../../../common/auth/require-actor-id';
import { PickupService } from '../../application/pickup.service';
import { PhysicalGoldPickupStatus } from '../../domain/constants/pickup-states';
import {
  CancelPickupDto,
  CreatePickupDto,
  StaffMarkPreparingDto,
  StaffPickupNoteDto,
} from '../../application/dto/create-pickup.dto';

@Controller('pickups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PickupsController {
  constructor(private readonly pickupService: PickupService) {}

  @Post()
  @RequirePermissions('customer.pickup.create')
  create(@Body() dto: CreatePickupDto, @CurrentUser() user: CurrentUserData) {
    return this.pickupService.create(user.userId, dto);
  }

  @Get()
  @RequirePermissions('customer.pickup.read_own')
  listMine(
    @CurrentUser() user: CurrentUserData,
    @Query('status') status?: PhysicalGoldPickupStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.pickupService.listMine(user.userId, {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('customer.pickup.read_own')
  getMine(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.pickupService.getMine(user.userId, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('customer.pickup.create')
  cancelMine(
    @Param('id') id: string,
    @Body() dto: CancelPickupDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.pickupService.cancelMine(user.userId, id, dto);
  }
}

@Controller('staff/pickups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaffPickupsController {
  constructor(private readonly pickupService: PickupService) {}

  @Get()
  @RequirePermissions('pickup.read')
  list(
    @Query('status') status?: PhysicalGoldPickupStatus,
    @Query('customerId') customerId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.pickupService.listStaff({
      status,
      customerId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('pickup.read')
  getOne(@Param('id') id: string) {
    return this.pickupService.getStaff(id);
  }

  @Post(':id/preparing')
  @RequirePermissions('pickup.prepare')
  preparing(
    @Param('id') id: string,
    @Body() dto: StaffMarkPreparingDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.pickupService.markPreparing(id, requireActorId(user), dto);
  }

  @Post(':id/ready')
  @RequirePermissions('pickup.prepare')
  ready(
    @Param('id') id: string,
    @Body() dto: StaffPickupNoteDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.pickupService.markReady(id, requireActorId(user), dto);
  }

  @Post(':id/deliver')
  @RequirePermissions('pickup.deliver')
  deliver(
    @Param('id') id: string,
    @Body() dto: StaffPickupNoteDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.pickupService.markDelivered(id, requireActorId(user), dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('pickup.cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelPickupDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.pickupService.cancelStaff(id, requireActorId(user), dto);
  }
}
