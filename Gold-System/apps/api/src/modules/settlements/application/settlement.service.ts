import { Injectable } from '@nestjs/common';

import { SettlementRepository } from '../infrastructure/repositories/settlement.repository';
import { SettlementNotFoundException } from '../domain/exceptions/settlement.exceptions';
import { SettlementResponseDto } from '../../payments/application/dto/payment-response.dto';

/**
 * Settlement Service
 *
 * Provides read access to Settlement records.
 * Write operations (settlement creation/update) are performed by
 * PaymentService.allocatePayment to maintain atomicity with the
 * payment allocation transaction.
 *
 * §8.1: A Trade is fully settled when 100% of Trade total has been paid.
 * §8.2: No installments — full payment required.
 * §8.3: No payment deadline — Accountant manages manually.
 */
@Injectable()
export class SettlementService {
  constructor(private readonly settlementRepo: SettlementRepository) {}

  async getSettlementByTradeId(tradeId: string): Promise<SettlementResponseDto> {
    const settlement = await this.settlementRepo.findByTradeId(tradeId);
    if (!settlement) throw new SettlementNotFoundException(tradeId);
    return SettlementResponseDto.from(settlement);
  }

  async getSettlementById(id: string): Promise<SettlementResponseDto> {
    const settlement = await this.settlementRepo.findById(id);
    if (!settlement) throw new SettlementNotFoundException(id);
    return SettlementResponseDto.from(settlement);
  }
}
