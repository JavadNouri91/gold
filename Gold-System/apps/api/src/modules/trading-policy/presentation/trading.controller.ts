import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../../common/decorators/permissions.decorator';
import { CurrentUser, CurrentUserData } from '../../../common/decorators/current-user.decorator';
import { TradingAdminService } from '../application/trading-admin.service';
import {
  AuditQueryDto,
  CopySessionDto,
  LimitDto,
  OverrideDto,
  OverviewQueryDto,
  SessionDto,
} from '../application/dto/trading.dto';

const READ_PERMISSIONS = [
  'trading.schedule.view',
  'trading.schedule.manage',
  'trading.limits.view',
  'trading.limits.manage',
  'trading.holidays.manage',
  'trading.audit.view',
] as const;

@UseGuards(JwtAuthGuard)
@Controller('trading')
export class TradingController {
  constructor(private readonly trading: TradingAdminService) {}

  @Get('overview')
  @RequireAnyPermission(...READ_PERMISSIONS)
  overview(@Query() query: OverviewQueryDto) {
    return this.trading.overview(query.from, query.to);
  }

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('trading.schedule.manage')
  createSession(@CurrentUser() user: CurrentUserData, @Body() body: SessionDto) {
    return this.trading.createSession(user.userId, body);
  }

  @Patch('sessions/:id')
  @RequirePermissions('trading.schedule.manage')
  updateSession(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: SessionDto,
  ) {
    return this.trading.updateSession(user.userId, id, body);
  }

  @Delete('sessions/:id')
  @RequirePermissions('trading.schedule.manage')
  deleteSession(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.trading.deleteSession(user.userId, id);
  }

  @Post('sessions/:id/copy')
  @RequirePermissions('trading.schedule.manage')
  copySession(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: CopySessionDto,
  ) {
    return this.trading.copySession(user.userId, id, body.weekdays);
  }

  @Post('overrides')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('trading.holidays.manage')
  createOverride(@CurrentUser() user: CurrentUserData, @Body() body: OverrideDto) {
    return this.trading.createOverride(user.userId, body);
  }

  @Patch('overrides/:id')
  @RequirePermissions('trading.holidays.manage')
  updateOverride(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() body: OverrideDto,
  ) {
    return this.trading.updateOverride(user.userId, id, body);
  }

  @Delete('overrides/:id')
  @RequirePermissions('trading.holidays.manage')
  deleteOverride(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.trading.deleteOverride(user.userId, id);
  }

  @Put('limits')
  @RequirePermissions('trading.limits.manage')
  upsertLimit(@CurrentUser() user: CurrentUserData, @Body() body: LimitDto) {
    return this.trading.upsertLimit(user.userId, body);
  }

  @Get('audit')
  @RequirePermissions('trading.audit.view')
  audit(@Query() query: AuditQueryDto) {
    return this.trading.auditLog(query.limit ?? 20, query.offset ?? 0);
  }
}
