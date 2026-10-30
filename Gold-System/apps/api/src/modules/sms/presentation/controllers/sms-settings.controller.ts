import { Body, Controller, Delete, Get, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { RequirePermissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUser, CurrentUserData } from '../../../../common/decorators/current-user.decorator';
import { SmsSettingsService, SmsSettingsView } from '../../application/sms-settings.service';
import { SmsTestService, SmsTestResult } from '../../application/sms-test.service';
import { SmsCreditResult, SmsCreditService } from '../../application/sms-credit.service';
import { SmsLineListResult, SmsLinesService } from '../../application/sms-lines.service';
import { SendTestSmsDto, UpdateSmsSettingsDto } from '../../application/dto/sms-settings.dto';

/** A live SMS costs money — allow only a handful of probes per minute. */
const SMS_TEST_THROTTLE = { short: { limit: 3, ttl: 60_000 }, long: { limit: 10, ttl: 60_000 } };

/**
 * SMS settings controller — admin panel.
 *
 *   GET    /sms-settings        — effective settings (secrets masked)
 *   PATCH  /sms-settings        — save provider, API key, sender line, base URLs
 *   DELETE /sms-settings        — drop database overrides, fall back to .env
 *   POST   /sms-settings/test   — send one live SMS to verify the credentials
 *
 * Values saved here are read on every send, so a change applies immediately
 * and does not require an API restart (unlike the .env values).
 *
 * SECURITY:
 *   - The full API key / password is never returned; only a masked hint.
 *   - Secrets are encrypted at rest (AES-256-GCM).
 *   - Every write and every test send is written to the audit log.
 */
@ApiTags('sms-settings')
@ApiBearerAuth()
@Controller({ path: 'sms-settings', version: '1' })
export class SmsSettingsController {
  constructor(
    private readonly settings: SmsSettingsService,
    private readonly testSms: SmsTestService,
    private readonly credit: SmsCreditService,
    private readonly lines: SmsLinesService,
  ) {}

  @Get()
  @RequirePermissions('sms.settings.manage')
  @ApiOperation({ summary: 'Read the effective SMS configuration' })
  get(): Promise<SmsSettingsView> {
    return this.settings.getView();
  }

  @Get('reveal')
  @RequirePermissions('sms.settings.manage')
  @ApiOperation({
    summary: 'Reveal the stored API key and panel password (audited)',
    description:
      'The regular GET only returns a masked hint. This endpoint returns the plaintext secrets and writes an audit entry on every call.',
  })
  reveal(
    @CurrentUser() actor: CurrentUserData,
    @Req() req: Request,
  ): Promise<{ apiKey: string; melipayamakPassword: string; apiKeySource: string }> {
    return this.settings.revealSecrets(actor.userId, req.ip);
  }

  @Get('credit')
  @Throttle(SMS_TEST_THROTTLE)
  @RequirePermissions('sms.settings.manage')
  @ApiOperation({ summary: 'Read the current provider panel credit (SMS.ir only)' })
  getCredit(): Promise<SmsCreditResult> {
    return this.credit.getCredit();
  }

  @Get('lines')
  @Throttle(SMS_TEST_THROTTLE)
  @RequirePermissions('sms.settings.manage')
  @ApiOperation({ summary: 'List the sender lines registered on the provider panel (SMS.ir only)' })
  getLines(): Promise<SmsLineListResult> {
    return this.lines.listLines();
  }

  @Patch()
  @RequirePermissions('sms.settings.manage')
  @ApiOperation({ summary: 'Save the SMS provider credentials' })
  update(
    @Body() dto: UpdateSmsSettingsDto,
    @CurrentUser() actor: CurrentUserData,
    @Req() req: Request,
  ): Promise<SmsSettingsView> {
    return this.settings.update(dto, actor.userId, req.ip);
  }

  @Delete()
  @RequirePermissions('sms.settings.manage')
  @ApiOperation({ summary: 'Forget stored overrides and use the .env values' })
  reset(@CurrentUser() actor: CurrentUserData, @Req() req: Request): Promise<SmsSettingsView> {
    return this.settings.resetToEnv(actor.userId, req.ip);
  }

  @Post('test')
  @Throttle(SMS_TEST_THROTTLE)
  @RequirePermissions('sms.settings.manage')
  @ApiOperation({ summary: 'Send a live test SMS with the saved credentials' })
  sendTest(
    @Body() dto: SendTestSmsDto,
    @CurrentUser() actor: CurrentUserData,
    @Req() req: Request,
  ): Promise<SmsTestResult> {
    return this.testSms.sendTest(dto.mobile, actor.userId, req.ip);
  }
}
