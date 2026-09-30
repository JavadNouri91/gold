import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../../common/decorators/permissions.decorator';
import { GoldLedgerService } from '../../application/gold-ledger.service';
import {
  GoldLedgerJournalResponseDto,
  GoldAccountBalanceResponseDto,
  GoldReconciliationReportDto,
} from '../../application/dto/gold-ledger-response.dto';
import { GOLD_ACCOUNTS } from '../../domain/constants/gold-accounts';

/**
 * Gold Ledger Controller
 *
 * Authorization: ALL endpoints require `ledger.read` or `ledger.reconcile` permission.
 * Customers MUST NOT access these endpoints (enforced via RBAC).
 *
 * Available endpoints (read-only):
 *   GET /ledger/gold/journals            — list all gold journals (paginated)
 *   GET /ledger/gold/journals/:id        — get journal by ID
 *   GET /ledger/gold/source/:type/:id    — get journals for a source
 *   GET /ledger/gold/accounts            — list gold account definitions
 *   GET /ledger/gold/balance/:code       — account balance (grams)
 *   GET /ledger/gold/balances            — all account balances
 *   GET /ledger/gold/reconcile           — run gold reconciliation report
 *
 * Source: docs/21-business-decisions.md §6.2, §12
 */
@Controller('ledger/gold')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GoldLedgerController {
  constructor(private readonly service: GoldLedgerService) {}

  @Get('journals')
  @RequirePermissions('ledger.read')
  async listJournals(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('sourceType') sourceType?: string,
  ) {
    const result = await this.service.listJournals({ limit, offset, sourceType });
    return {
      journals: result.journals.map((j) => GoldLedgerJournalResponseDto.fromEntity(j)),
      total: result.total,
      limit,
      offset,
    };
  }

  @Get('journals/:id')
  @RequirePermissions('ledger.read')
  async getJournal(@Param('id') id: string): Promise<GoldLedgerJournalResponseDto> {
    const journal = await this.service.getJournalById(id);
    return GoldLedgerJournalResponseDto.fromEntity(journal);
  }

  @Get('source/:sourceType/:sourceId')
  @RequirePermissions('ledger.read')
  async getJournalsBySource(
    @Param('sourceType') sourceType: string,
    @Param('sourceId') sourceId: string,
  ): Promise<GoldLedgerJournalResponseDto[]> {
    const journals = await this.service.getJournalsBySource(sourceType, sourceId);
    return journals.map((j) => GoldLedgerJournalResponseDto.fromEntity(j));
  }

  @Get('accounts')
  @RequirePermissions('ledger.read')
  getAccounts() {
    return Object.values(GOLD_ACCOUNTS).map((a) => ({
      code: a.code,
      name: a.name,
      nameFa: a.nameFa,
      active: a.active,
      blockedReason: a.blockedReason ?? null,
    }));
  }

  @Get('balance/:accountCode')
  @RequirePermissions('ledger.read')
  async getAccountBalance(
    @Param('accountCode') accountCode: string,
  ): Promise<GoldAccountBalanceResponseDto> {
    return this.service.getAccountBalance(accountCode);
  }

  @Get('balances')
  @RequirePermissions('ledger.read')
  async getAllBalances(): Promise<GoldAccountBalanceResponseDto[]> {
    return this.service.getAllAccountBalances();
  }

  @Get('reconcile')
  @RequirePermissions('ledger.reconcile')
  async reconcile(): Promise<GoldReconciliationReportDto> {
    return this.service.reconcile();
  }
}
