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
import { FinancialLedgerService } from '../../application/financial-ledger.service';
import {
  LedgerJournalResponseDto,
  AccountBalanceResponseDto,
  ReconciliationReportDto,
} from '../../application/dto/ledger-response.dto';
import { FINANCIAL_ACCOUNTS } from '../../domain/constants/chart-of-accounts';

/**
 * Financial Ledger Controller
 *
 * Authorization: ALL endpoints require `ledger.read` or `ledger.reconcile` permission.
 * Customers MUST NOT be able to access these endpoints.
 * Internal staff only (enforced via RBAC).
 *
 * Available endpoints (read-only — business transactions auto-post their own entries):
 *   GET /ledger/financial/journals         — list all journals (paginated)
 *   GET /ledger/financial/journals/:id     — get journal by ID
 *   GET /ledger/financial/source/:type/:id — get journals for a source
 *   GET /ledger/financial/accounts         — list all account definitions
 *   GET /ledger/financial/balance/:code    — account balance
 *   GET /ledger/financial/balances         — all account balances
 *   GET /ledger/financial/reconcile        — run reconciliation report
 *
 * Source: docs/21-business-decisions.md §6.3, §12
 */
@Controller('ledger/financial')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FinancialLedgerController {
  constructor(private readonly service: FinancialLedgerService) {}

  @Get('journals')
  @RequirePermissions('ledger.read')
  async listJournals(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('sourceType') sourceType?: string,
  ) {
    const result = await this.service.listJournals({ limit, offset, sourceType });
    return {
      journals: result.journals.map((j) => LedgerJournalResponseDto.fromEntity(j)),
      total: result.total,
      limit,
      offset,
    };
  }

  @Get('journals/:id')
  @RequirePermissions('ledger.read')
  async getJournal(@Param('id') id: string): Promise<LedgerJournalResponseDto> {
    const journal = await this.service.getJournalById(id);
    return LedgerJournalResponseDto.fromEntity(journal);
  }

  @Get('source/:sourceType/:sourceId')
  @RequirePermissions('ledger.read')
  async getJournalsBySource(
    @Param('sourceType') sourceType: string,
    @Param('sourceId') sourceId: string,
  ): Promise<LedgerJournalResponseDto[]> {
    const journals = await this.service.getJournalsBySource(sourceType, sourceId);
    return journals.map((j) => LedgerJournalResponseDto.fromEntity(j));
  }

  @Get('accounts')
  @RequirePermissions('ledger.read')
  getAccounts() {
    return Object.values(FINANCIAL_ACCOUNTS).map((a) => ({
      code: a.code,
      name: a.name,
      nameFa: a.nameFa,
      type: a.type,
      active: a.active,
      blockedReason: a.blockedReason ?? null,
    }));
  }

  @Get('balance/:accountCode')
  @RequirePermissions('ledger.read')
  async getAccountBalance(
    @Param('accountCode') accountCode: string,
  ): Promise<AccountBalanceResponseDto> {
    const bal = await this.service.getAccountBalance(accountCode);
    return AccountBalanceResponseDto.fromData({ accountCode, ...bal });
  }

  @Get('balances')
  @RequirePermissions('ledger.read')
  async getAllBalances(): Promise<AccountBalanceResponseDto[]> {
    const balances = await this.service.getAllAccountBalances();
    return balances.map((b) =>
      AccountBalanceResponseDto.fromData({
        accountCode: b.accountCode,
        totalDebit: b.totalDebit,
        totalCredit: b.totalCredit,
        balance: b.balance,
      }),
    );
  }

  @Get('reconcile')
  @RequirePermissions('ledger.reconcile')
  async reconcile(): Promise<ReconciliationReportDto> {
    return this.service.reconcile();
  }
}
