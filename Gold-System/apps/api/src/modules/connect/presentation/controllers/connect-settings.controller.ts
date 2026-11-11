import { Body, Controller, Delete, Get, Patch, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { RequirePermissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUser, CurrentUserData } from '../../../../common/decorators/current-user.decorator';
import { ConnectSettingsService } from '../../application/connect-settings.service';
import {
  DeleteConnectSecretDto,
  UpdateConnectSettingsDto,
} from '../../application/dto/update-connect-settings.dto';

const CONNECT_TEST_THROTTLE = {
  short: { limit: 3, ttl: 60_000 },
  long: { limit: 10, ttl: 60_000 },
};

@Controller({ path: 'admin/integrations/connect', version: '1' })
export class ConnectSettingsController {
  constructor(private readonly settings: ConnectSettingsService) {}

  @Get('settings')
  @RequirePermissions('connect.settings.read')
  getSettings() {
    return this.settings.getSettings();
  }

  @Patch('settings')
  @RequirePermissions('connect.settings.manage')
  update(
    @Body() dto: UpdateConnectSettingsDto,
    @CurrentUser() actor: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.settings.update(dto, actor.userId, req.ip);
  }

  @Delete('settings/secret')
  @RequirePermissions('connect.settings.manage')
  removeSecret(
    @Body() dto: DeleteConnectSecretDto,
    @CurrentUser() actor: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.settings.removeSecret(dto.secret, dto.confirmed, actor.userId, req.ip);
  }

  @Get('status')
  @RequirePermissions('connect.status.read')
  status() {
    return this.settings.getStatus();
  }

  @Post('test/http')
  @Throttle(CONNECT_TEST_THROTTLE)
  @RequirePermissions('connect.connection.test')
  testHttp(@CurrentUser() actor: CurrentUserData, @Req() req: Request) {
    return this.settings.testHttp(actor.userId, req.ip);
  }

  @Post('test/websocket')
  @Throttle(CONNECT_TEST_THROTTLE)
  @RequirePermissions('connect.connection.test')
  testWebSocket(@CurrentUser() actor: CurrentUserData, @Req() req: Request) {
    return this.settings.testWebSocket(actor.userId, req.ip);
  }
}
