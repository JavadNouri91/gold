import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { CustomerStatus, CustomerType } from '@gold/shared-types';
import { PhysicalGoldPickupEntity } from '../domain/entities/pickup.entity';

import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { CustomerAccountRepository } from '../../customer-accounts/infrastructure/repositories/customer-account.repository';
import { FinancialLedgerService } from '../../financial-ledger/application/financial-ledger.service';
import { CustomerActivityService } from '../../orders/application/customer-activity.service';
import { GoldLedgerService } from '../../gold-ledger/application/gold-ledger.service';
import { NotificationService } from '../../notifications/application/notification.service';
import { NotificationType } from '../../notifications/domain/constants/notification-types';
import { PickupRepository } from '../infrastructure/repositories/pickup.repository';
import { PickupFeeService } from './pickup-fee.service';
import { PickupDocumentService } from './pickup-document.service';
import {
  PhysicalGoldPickupStatus,
  CUSTOMER_CANCELLABLE_STATUSES,
  PICKUP_PURITY_RATIO,
} from '../domain/constants/pickup-states';
import {
  CustomerNotEligibleForPickupException,
  InsufficientPickupFeeCreditException,
  InsufficientPickupGoldException,
  InvalidPickupStateTransitionException,
  InvalidScheduledPickupDateException,
  PickupNotFoundException,
  StoreNotConfiguredException,
} from '../domain/exceptions/pickup.exceptions';
import { PickupResponseDto } from './dto/pickup-response.dto';
import {
  CancelPickupDto,
  CreatePickupDto,
  StaffMarkPreparingDto,
  StaffPickupNoteDto,
} from './dto/create-pickup.dto';
import { tehranDateStartUtc, tehranParts } from '../../trading-policy/domain/trading-time';

@Injectable()
export class PickupService {
  private readonly logger = new Logger(PickupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PickupRepository,
    private readonly activity: CustomerActivityService,
    private readonly accountRepo: CustomerAccountRepository,
    private readonly goldLedger: GoldLedgerService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    private readonly feeService: PickupFeeService,
    private readonly documentService: PickupDocumentService,
    private readonly financialLedger: FinancialLedgerService,
  ) {}

  async create(actorUserId: string, dto: CreatePickupDto): Promise<PickupResponseDto> {
    const { customer } = await this.resolveCustomerAndAccount(actorUserId);
    const store = await this.prisma.store.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, address: true },
    });
    if (!store) throw new StoreNotConfiguredException();

    const weightGrams = new Decimal(dto.weightGrams);
    if (!weightGrams.gt(0) || !weightGrams.isInteger()) {
      throw new InsufficientPickupGoldException(new Decimal(0), weightGrams);
    }

    // Compute the conversion fee BEFORE the transaction, from the active policy.
    const fee = await this.feeService.compute(
      customer.type as CustomerType | null,
      weightGrams,
      dto.priceSnapshotId,
    );
    const hasFee = fee.amountRial.gt(0);

    const pickup = await this.prisma.$transaction(async (tx) => {
      await this.accountRepo.lockByCustomerId(tx, customer.id);

      const availableWeight = await this.activity.sellableWeightGrams(customer.id, tx);
      if (weightGrams.gt(availableWeight)) {
        throw new InsufficientPickupGoldException(availableWeight, weightGrams);
      }

      const pickupNumber = await this.repo.nextPickupNumber(tx);
      const created = await this.repo.createInTx(tx, {
        pickupNumber,
        customerId: customer.id,
        storeId: store.id,
        weightGrams,
        purityRatio: new Decimal(PICKUP_PURITY_RATIO),
        customerNote: dto.customerNote?.trim() || null,
        actorId: actorUserId,
      });

      // Reserve the conversion fee from the rial wallet (if any).
      let walletAvailableAfterRial: Decimal | null = null;
      if (hasFee) {
        const availableRial = await this.accountRepo.availableRialInTx(tx, customer.id);
        if (fee.amountRial.gt(availableRial)) {
          throw new InsufficientPickupFeeCreditException(availableRial, fee.amountRial);
        }
        walletAvailableAfterRial = await this.accountRepo.reserveCredit({
          tx,
          customerId: customer.id,
          amount: fee.amountRial,
          orderId: created.id,
          actorId: actorUserId,
          sourceType: 'PICKUP',
          sourceId: created.id,
        });
      }

      await this.repo.createChargeInTx(tx, {
        pickupId: created.id,
        code: 'PICKUP_CONVERSION_FEE',
        labelFa: fee.policy?.labelFa ?? 'کارمزد تبدیل به فیزیکی',
        mode: fee.mode,
        rateValue: fee.rateValue,
        calculationBase: fee.calculationBase,
        baseAmountRial: fee.baseAmountRial,
        amountRial: fee.amountRial,
        goldPricePerGramRial: fee.goldPricePerGramRial,
        policyId: fee.policy?.id ?? null,
        status: hasFee ? 'RESERVED' : 'NONE',
        walletAvailableAfterRial: hasFee ? walletAvailableAfterRial : null,
        reservedAt: hasFee ? new Date() : null,
      });

      return created;
    });

    // Non-destructive: store the immutable pre-invoice JSON (best effort).
    const preInvoice = await this.documentService.generate({
      documentType: 'PRE_INVOICE',
      pickupNumber: pickup.pickupNumber,
      generatedAt: new Date(),
      customer: {
        id: customer.id,
        customerNumber: customer.customerNumber,
        name: `${customer.firstName} ${customer.lastName}`.trim(),
        mobile: customer.mobile,
        customerType: customer.type,
      },
      weightGrams,
      purityRatio: new Decimal(PICKUP_PURITY_RATIO),
      status: pickup.status,
      fee: {
        code: 'PICKUP_CONVERSION_FEE',
        labelFa: fee.policy?.labelFa ?? 'کارمزد تبدیل به فیزیکی',
        mode: fee.mode,
        rateValue: fee.rateValue,
        calculationBase: fee.calculationBase,
        baseAmountRial: fee.baseAmountRial,
        amountRial: fee.amountRial,
        goldPricePerGramRial: fee.goldPricePerGramRial,
        status: hasFee ? 'RESERVED' : 'NONE',
        walletAvailableAfterRial: null,
      },
    });
    if (preInvoice) {
      await this.repo.setPreInvoiceInTx(this.prisma, pickup.id, {
        key: preInvoice.key,
        mimeType: preInvoice.mimeType,
        generatedAt: preInvoice.generatedAt,
      });
    }

    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'PICKUP_REQUESTED',
      entityType: 'PhysicalGoldPickup',
      entityId: pickup.id,
      after: {
        pickupNumber: pickup.pickupNumber,
        status: pickup.status,
        weightGrams: pickup.weightGrams.toFixed(6),
        purityRatio: pickup.purityRatio.toFixed(6),
        feeRial: fee.amountRial.toFixed(2),
      },
    });

    await this.notifications.dispatch({
      recipientId: actorUserId,
      recipientMobile: customer.mobile,
      type: NotificationType.PICKUP_REQUESTED,
      subject: 'درخواست تحویل حضوری ثبت شد',
      body: `درخواست تحویل حضوری ${pickup.pickupNumber} به وزن ${pickup.weightGrams.toFixed(3)} گرم ثبت شد.`,
      relatedEntityType: 'PhysicalGoldPickup',
      relatedEntityId: pickup.id,
    });
    await this.notifications.dispatch({
      recipientId: null,
      type: NotificationType.INTERNAL_NEW_PICKUP,
      subject: 'درخواست تحویل حضوری جدید',
      body: `درخواست ${pickup.pickupNumber} برای مشتری ثبت شد.`,
      relatedEntityType: 'PhysicalGoldPickup',
      relatedEntityId: pickup.id,
    });

    this.logger.log(`Pickup requested: ${pickup.pickupNumber} by customer ${customer.id}`);
    return PickupResponseDto.from(pickup);
  }

  async feePreview(actorUserId: string, weightGrams: Decimal, priceSnapshotId?: string) {
    const { customer } = await this.resolveCustomerAndAccount(actorUserId);
    const fee = await this.feeService.compute(
      customer.type as CustomerType | null,
      weightGrams,
      priceSnapshotId,
    );
    const account = await this.accountRepo.findByCustomerId(customer.id);
    const availableRial = account?.availableRial ?? new Decimal(0);
    const shortfall = fee.amountRial.gt(availableRial)
      ? fee.amountRial.minus(availableRial)
      : new Decimal(0);
    return {
      labelFa: fee.policy?.labelFa ?? 'کارمزد تبدیل به فیزیکی',
      mode: fee.mode,
      rateValue: fee.rateValue.toFixed(6),
      calculationBase: fee.calculationBase,
      baseAmountRial: fee.baseAmountRial.toFixed(2),
      amountRial: fee.amountRial.toFixed(2),
      goldPricePerGramRial: fee.goldPricePerGramRial?.toFixed(2) ?? null,
      priceSnapshotId: fee.priceSnapshotId,
      availableRial: availableRial.toFixed(2),
      canAfford: fee.amountRial.lte(availableRial),
      shortfallRial: shortfall.toFixed(2),
    };
  }

  async listMine(
    actorUserId: string,
    opts?: { status?: PhysicalGoldPickupStatus; limit?: number; offset?: number },
  ) {
    const { customer } = await this.resolveCustomerAndAccount(actorUserId);
    const { items, total } = await this.repo.listForCustomer(customer.id, opts);
    return {
      data: items.map((i) => PickupResponseDto.from(i)),
      meta: { total, limit: opts?.limit ?? 50, offset: opts?.offset ?? 0 },
    };
  }

  async getMine(actorUserId: string, pickupId: string): Promise<PickupResponseDto> {
    const { customer } = await this.resolveCustomerAndAccount(actorUserId);
    const pickup = await this.repo.findByIdForCustomer(pickupId, customer.id);
    if (!pickup) throw new PickupNotFoundException(pickupId);
    return PickupResponseDto.from(pickup);
  }

  async downloadDocumentForCustomer(
    actorUserId: string,
    pickupId: string,
    kind: 'PRE_INVOICE' | 'INVOICE',
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const { customer } = await this.resolveCustomerAndAccount(actorUserId);
    const pickup = await this.repo.findByIdForCustomer(pickupId, customer.id);
    if (!pickup) throw new PickupNotFoundException(pickupId);
    return this.readPickupDocument(pickup, kind);
  }

  async downloadDocumentForStaff(
    pickupId: string,
    kind: 'PRE_INVOICE' | 'INVOICE',
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const pickup = await this.repo.findById(pickupId);
    if (!pickup) throw new PickupNotFoundException(pickupId);
    return this.readPickupDocument(pickup, kind);
  }

  private async readPickupDocument(
    pickup: PhysicalGoldPickupEntity,
    kind: 'PRE_INVOICE' | 'INVOICE',
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const isPreInvoice = kind === 'PRE_INVOICE';
    const key = isPreInvoice ? pickup.preInvoiceKey : pickup.invoiceKey;
    const mimeType = (isPreInvoice ? pickup.preInvoiceMimeType : pickup.invoiceMimeType) ?? 'application/json';
    if (!key) {
      throw new NotFoundException(
        isPreInvoice ? 'پیش‌فاکتور برای این درخواست موجود نیست.' : 'فاکتور برای این درخواست موجود نیست.',
      );
    }
    const buffer = await this.documentService.read(key);
    const fileName = `${pickup.pickupNumber}-${isPreInvoice ? 'pre-invoice' : 'invoice'}.json`;
    return { buffer, mimeType, fileName };
  }

  async cancelMine(
    actorUserId: string,
    pickupId: string,
    dto: CancelPickupDto,
  ): Promise<PickupResponseDto> {
    const { customer } = await this.resolveCustomerAndAccount(actorUserId);
    const existing = await this.repo.findByIdForCustomer(pickupId, customer.id);
    if (!existing) throw new PickupNotFoundException(pickupId);
    if (!CUSTOMER_CANCELLABLE_STATUSES.includes(existing.status)) {
      throw new InvalidPickupStateTransitionException(existing.status, 'لغو');
    }
    return this.cancelInternal(existing.id, actorUserId, dto.reason, true);
  }

  async listStaff(opts: {
    status?: PhysicalGoldPickupStatus;
    customerId?: string;
    limit?: number;
    offset?: number;
  }) {
    const { items, total } = await this.repo.listStaff(opts);
    return {
      data: items.map((i) => PickupResponseDto.from(i)),
      meta: { total, limit: opts.limit ?? 50, offset: opts.offset ?? 0 },
    };
  }

  async getStaff(pickupId: string): Promise<PickupResponseDto> {
    const pickup = await this.repo.findById(pickupId);
    if (!pickup) throw new PickupNotFoundException(pickupId);
    return PickupResponseDto.from(pickup);
  }

  async markPreparing(
    pickupId: string,
    actorUserId: string,
    dto: StaffMarkPreparingDto,
  ): Promise<PickupResponseDto> {
    const scheduledPickupAt = this.parseScheduledPickupDate(dto.scheduledPickupAt);
    return this.staffTransition(
      pickupId,
      actorUserId,
      PhysicalGoldPickupStatus.PREPARING,
      'شروع آماده‌سازی',
      dto.staffNote,
      scheduledPickupAt,
    );
  }

  async markReady(
    pickupId: string,
    actorUserId: string,
    dto: StaffPickupNoteDto,
  ): Promise<PickupResponseDto> {
    const pickup = await this.staffTransition(
      pickupId,
      actorUserId,
      PhysicalGoldPickupStatus.READY,
      'اعلام آماده تحویل',
      dto.staffNote,
    );
    const customer = await this.prisma.customer.findUnique({
      where: { id: pickup.customerId },
      select: { userId: true, mobile: true },
    });
    if (customer?.userId) {
      await this.notifications.dispatch({
        recipientId: customer.userId,
        recipientMobile: customer.mobile,
        type: NotificationType.PICKUP_READY,
        subject: 'آماده تحویل در فروشگاه',
        body: `درخواست ${pickup.pickupNumber} آماده تحویل در فروشگاه است.`,
        relatedEntityType: 'PhysicalGoldPickup',
        relatedEntityId: pickup.id,
      });
    }
    return pickup;
  }

  async markDelivered(
    pickupId: string,
    actorUserId: string,
    dto: StaffPickupNoteDto,
  ): Promise<PickupResponseDto> {
    const existing = await this.repo.findById(pickupId);
    if (!existing) throw new PickupNotFoundException(pickupId);
    if (!existing.canTransitionTo(PhysicalGoldPickupStatus.DELIVERED)) {
      throw new InvalidPickupStateTransitionException(existing.status, 'ثبت تحویل');
    }

    const pickup = await this.prisma.$transaction(async (tx) => {
      const updated = await this.repo.transitionInTx(tx, {
        id: pickupId,
        toStatus: PhysicalGoldPickupStatus.DELIVERED,
        actorId: actorUserId,
        staffNote: dto.staffNote,
      });

      // Fulfill customer gold obligation; GA-01 left untouched (open-questions #39).
      await this.goldLedger.postJournalInTx(tx, {
        idempotencyKey: `PICKUP_DELIVER_GOLD_${pickupId}`,
        sourceType: 'PICKUP_DELIVER',
        sourceId: pickupId,
        description: `Pickup ${updated.pickupNumber} delivered — customer gold obligation reduced`,
        postedByUserId: actorUserId,
        entries: [
          {
            accountCode: 'GA-02',
            direction: 'OUT',
            quantity: updated.weightGrams,
            purity: updated.purityRatio,
            description: `Pickup ${updated.pickupNumber}: physical bar delivered`,
          },
        ],
      });

      // Settle the reserved conversion fee (if any): consume credit + FA-16 income.
      if (existing.charge && existing.charge.status === 'RESERVED' && existing.charge.amountRial.gt(0)) {
        const feeAmount = existing.charge.amountRial;
        await this.accountRepo.consumeCredit({
          tx,
          customerId: updated.customerId,
          amount: feeAmount,
          tradeId: pickupId,
          orderId: pickupId,
          actorId: actorUserId,
          sourceType: 'PICKUP',
          sourceId: pickupId,
        });

        await this.financialLedger.postJournalInTx(tx, {
          idempotencyKey: `PICKUP_FEE_${pickupId}`,
          sourceType: 'PICKUP_FEE',
          sourceId: pickupId,
          description: `Pickup ${updated.pickupNumber} conversion fee`,
          postedByUserId: actorUserId,
          entries: [
            { accountCode: 'FA-02', debit: feeAmount, credit: new Decimal(0) },
            { accountCode: 'FA-16', debit: new Decimal(0), credit: feeAmount },
          ],
        });

        await this.repo.updateChargeInTx(tx, pickupId, {
          status: 'SETTLED',
          settledAt: new Date(),
        });
      }

      return updated;
    });

    // Non-destructive: store the immutable invoice JSON (best effort).
    const existingCharge = existing.charge;
    const invoice = await this.documentService.generate({
      documentType: 'INVOICE',
      pickupNumber: pickup.pickupNumber,
      generatedAt: new Date(),
      customer: {
        id: existing.customer?.id ?? pickup.customerId,
        customerNumber: existing.customer?.customerNumber ?? '',
        name: existing.customer ? `${existing.customer.firstName} ${existing.customer.lastName}`.trim() : '',
        mobile: existing.customer?.mobile ?? '',
        customerType: existing.customer?.type ?? null,
      },
      weightGrams: pickup.weightGrams,
      purityRatio: pickup.purityRatio,
      status: pickup.status,
      fee: existingCharge
        ? {
            code: existingCharge.code,
            labelFa: existingCharge.labelFa,
            mode: existingCharge.mode,
            rateValue: existingCharge.rateValue,
            calculationBase: existingCharge.calculationBase,
            baseAmountRial: existingCharge.baseAmountRial,
            amountRial: existingCharge.amountRial,
            goldPricePerGramRial: existingCharge.goldPricePerGramRial,
            status: 'SETTLED',
            walletAvailableAfterRial: existingCharge.walletAvailableAfterRial,
          }
        : null,
    });
    if (invoice) {
      await this.repo.setInvoiceInTx(this.prisma, pickup.id, {
        key: invoice.key,
        mimeType: invoice.mimeType,
        generatedAt: invoice.generatedAt,
      });
    }

    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'PICKUP_DELIVERED',
      entityType: 'PhysicalGoldPickup',
      entityId: pickup.id,
      before: { status: existing.status },
      after: { status: pickup.status, weightGrams: pickup.weightGrams.toFixed(6) },
    });

    const customer = await this.prisma.customer.findUnique({
      where: { id: pickup.customerId },
      select: { userId: true, mobile: true },
    });
    if (customer?.userId) {
      await this.notifications.dispatch({
        recipientId: customer.userId,
        recipientMobile: customer.mobile,
        type: NotificationType.PICKUP_DELIVERED,
        subject: 'تحویل حضوری انجام شد',
        body: `درخواست ${pickup.pickupNumber} در فروشگاه تحویل داده شد.`,
        relatedEntityType: 'PhysicalGoldPickup',
        relatedEntityId: pickup.id,
      });
    }

    this.logger.log(`Pickup delivered: ${pickup.pickupNumber}`);
    return PickupResponseDto.from(pickup);
  }

  async cancelStaff(
    pickupId: string,
    actorUserId: string,
    dto: CancelPickupDto,
  ): Promise<PickupResponseDto> {
    const existing = await this.repo.findById(pickupId);
    if (!existing) throw new PickupNotFoundException(pickupId);
    if (!existing.canTransitionTo(PhysicalGoldPickupStatus.CANCELLED)) {
      throw new InvalidPickupStateTransitionException(existing.status, 'لغو');
    }
    return this.cancelInternal(pickupId, actorUserId, dto.reason, false);
  }

  private async cancelInternal(
    pickupId: string,
    actorUserId: string,
    reason: string,
    byCustomer: boolean,
  ): Promise<PickupResponseDto> {
    const existing = await this.repo.findById(pickupId);
    if (!existing) throw new PickupNotFoundException(pickupId);

    const cancelledByKind = byCustomer ? 'CUSTOMER' : 'STAFF';
    const pickup = await this.prisma.$transaction(async (tx) => {
      const updated = await this.repo.transitionInTx(tx, {
        id: pickupId,
        toStatus: PhysicalGoldPickupStatus.CANCELLED,
        actorId: actorUserId,
        cancelReason: reason,
        cancelledByKind,
      });

      // Release the reserved conversion fee back to the rial wallet.
      if (existing.charge && existing.charge.status === 'RESERVED' && existing.charge.amountRial.gt(0)) {
        await this.accountRepo.releaseCredit({
          tx,
          customerId: updated.customerId,
          amount: existing.charge.amountRial,
          orderId: pickupId,
          actorId: actorUserId,
          reason: `Pickup ${updated.pickupNumber} cancelled — conversion fee released`,
          sourceType: 'PICKUP',
          sourceId: pickupId,
        });
        await this.repo.updateChargeInTx(tx, pickupId, {
          status: 'RELEASED',
          releasedAt: new Date(),
        });
      }

      return updated;
    });

    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: byCustomer ? 'PICKUP_CANCELLED_BY_CUSTOMER' : 'PICKUP_CANCELLED_BY_STAFF',
      entityType: 'PhysicalGoldPickup',
      entityId: pickup.id,
      before: { status: existing.status },
      after: { status: pickup.status, cancelReason: reason, cancelledByKind },
      reason,
    });

    const customer = await this.prisma.customer.findUnique({
      where: { id: pickup.customerId },
      select: { userId: true, mobile: true },
    });
    if (customer?.userId) {
      await this.notifications.dispatch({
        recipientId: customer.userId,
        recipientMobile: customer.mobile,
        type: NotificationType.PICKUP_CANCELLED,
        subject: 'لغو درخواست تحویل حضوری',
        body: `درخواست ${pickup.pickupNumber} لغو شد و وزن رزرو شده آزاد گردید.`,
        relatedEntityType: 'PhysicalGoldPickup',
        relatedEntityId: pickup.id,
      });
    }

    return PickupResponseDto.from(pickup);
  }

  private async staffTransition(
    pickupId: string,
    actorUserId: string,
    toStatus: PhysicalGoldPickupStatus,
    actionLabel: string,
    staffNote?: string | null,
    scheduledPickupAt?: Date | null,
  ): Promise<PickupResponseDto> {
    const existing = await this.repo.findById(pickupId);
    if (!existing) throw new PickupNotFoundException(pickupId);
    if (!existing.canTransitionTo(toStatus)) {
      throw new InvalidPickupStateTransitionException(existing.status, actionLabel);
    }

    const pickup = await this.repo.transitionInTx(this.prisma, {
      id: pickupId,
      toStatus,
      actorId: actorUserId,
      staffNote,
      scheduledPickupAt,
    });

    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: `PICKUP_${toStatus}`,
      entityType: 'PhysicalGoldPickup',
      entityId: pickup.id,
      before: { status: existing.status },
      after: {
        status: pickup.status,
        staffNote: staffNote ?? null,
        scheduledPickupAt: scheduledPickupAt?.toISOString() ?? null,
      },
    });

    return PickupResponseDto.from(pickup);
  }

  /** Accepts Gregorian `YYYY-MM-DD`; must be today or later in Asia/Tehran. */
  private parseScheduledPickupDate(dateKey: string): Date {
    const key = dateKey.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      throw new InvalidScheduledPickupDateException('تاریخ تحویل نامعتبر است.');
    }
    const todayKey = tehranParts(new Date()).dateKey;
    if (key < todayKey) {
      throw new InvalidScheduledPickupDateException(
        'تاریخ تحویل نمی‌تواند قبل از امروز باشد.',
      );
    }
    return tehranDateStartUtc(key);
  }

  private async resolveCustomerAndAccount(actorUserId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { userId: actorUserId },
      select: {
        id: true,
        mobile: true,
        firstName: true,
        lastName: true,
        customerNumber: true,
        type: true,
        status: true,
        accountStatus: true,
        account: { select: { id: true, status: true } },
      },
    });

    if (!customer) {
      throw new CustomerNotEligibleForPickupException(
        'No customer profile found for this account. Please complete registration.',
      );
    }
    if (customer.accountStatus != null && customer.accountStatus !== 'ACTIVE') {
      throw new CustomerNotEligibleForPickupException('Customer account is inactive or blocked.');
    }
    if (customer.status !== CustomerStatus.ACTIVE) {
      throw new CustomerNotEligibleForPickupException(
        `Customer account is not active (current status: ${customer.status}).`,
      );
    }
    if (!customer.account || customer.account.status !== 'ACTIVE') {
      throw new CustomerNotEligibleForPickupException(
        'Customer credit account is not active. Cannot request pickup.',
      );
    }
    return { customer, account: customer.account };
  }
}
