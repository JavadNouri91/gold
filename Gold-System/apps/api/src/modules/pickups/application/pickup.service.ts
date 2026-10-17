import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { CustomerStatus } from '@gold/shared-types';

import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { CustomerAccountRepository } from '../../customer-accounts/infrastructure/repositories/customer-account.repository';
import { CustomerActivityService } from '../../orders/application/customer-activity.service';
import { GoldLedgerService } from '../../gold-ledger/application/gold-ledger.service';
import { NotificationService } from '../../notifications/application/notification.service';
import { NotificationType } from '../../notifications/domain/constants/notification-types';
import { PickupRepository } from '../infrastructure/repositories/pickup.repository';
import {
  PhysicalGoldPickupStatus,
  CUSTOMER_CANCELLABLE_STATUSES,
  PICKUP_PURITY_RATIO,
} from '../domain/constants/pickup-states';
import {
  CustomerNotEligibleForPickupException,
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

    const pickup = await this.prisma.$transaction(async (tx) => {
      await this.accountRepo.lockByCustomerId(tx, customer.id);
      const available = await this.activity.sellableWeightGrams(customer.id, tx);
      if (weightGrams.gt(available)) {
        throw new InsufficientPickupGoldException(available, weightGrams);
      }

      const pickupNumber = await this.repo.nextPickupNumber(tx);
      return this.repo.createInTx(tx, {
        pickupNumber,
        customerId: customer.id,
        storeId: store.id,
        weightGrams,
        purityRatio: new Decimal(PICKUP_PURITY_RATIO),
        customerNote: dto.customerNote?.trim() || null,
        actorId: actorUserId,
      });
    });

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

      return updated;
    });

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
    const pickup = await this.repo.transitionInTx(this.prisma, {
      id: pickupId,
      toStatus: PhysicalGoldPickupStatus.CANCELLED,
      actorId: actorUserId,
      cancelReason: reason,
      cancelledByKind,
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
