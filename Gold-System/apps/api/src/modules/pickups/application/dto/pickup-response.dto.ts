import { PhysicalGoldPickupEntity } from '../../domain/entities/pickup.entity';
import { PhysicalGoldPickupStatus } from '../../domain/constants/pickup-states';

export class PickupEventDto {
  id!: string;
  status!: PhysicalGoldPickupStatus;
  note!: string | null;
  actorId!: string | null;
  createdAt!: string;
}

export class PickupCustomerDto {
  id!: string;
  customerNumber!: string;
  firstName!: string;
  lastName!: string;
  mobile!: string;
}

export class PickupFeeDto {
  code!: string;
  labelFa!: string;
  mode!: string;
  rateValue!: string;
  calculationBase!: string | null;
  baseAmountRial!: string;
  amountRial!: string;
  goldPricePerGramRial!: string | null;
  status!: string;
  walletAvailableAfterRial!: string | null;
  reservedAt!: string | null;
  settledAt!: string | null;
  releasedAt!: string | null;
}

export class PickupDocumentsDto {
  preInvoiceAvailable!: boolean;
  invoiceAvailable!: boolean;
}

export class PickupResponseDto {
  id!: string;
  pickupNumber!: string;
  customerId!: string;
  storeId!: string;
  weightGrams!: string;
  purityRatio!: string;
  status!: PhysicalGoldPickupStatus;
  customerNote!: string | null;
  staffNote!: string | null;
  cancelReason!: string | null;
  cancelledByKind!: 'CUSTOMER' | 'STAFF' | null;
  scheduledPickupAt!: string | null;
  requestedAt!: string;
  preparingAt!: string | null;
  readyAt!: string | null;
  deliveredAt!: string | null;
  cancelledAt!: string | null;
  preparingById!: string | null;
  readyById!: string | null;
  deliveredById!: string | null;
  cancelledById!: string | null;
  createdAt!: string;
  updatedAt!: string;
  events!: PickupEventDto[];
  customer!: PickupCustomerDto | null;
  fee!: PickupFeeDto | null;
  goldPricePerGramRial!: string | null;
  documents!: PickupDocumentsDto;

  static from(entity: PhysicalGoldPickupEntity): PickupResponseDto {
    const dto = new PickupResponseDto();
    dto.id = entity.id;
    dto.pickupNumber = entity.pickupNumber;
    dto.customerId = entity.customerId;
    dto.storeId = entity.storeId;
    dto.weightGrams = entity.weightGrams.toFixed(6);
    dto.purityRatio = entity.purityRatio.toFixed(6);
    dto.status = entity.status;
    dto.customerNote = entity.customerNote;
    dto.staffNote = entity.staffNote;
    dto.cancelReason = entity.cancelReason;
    dto.cancelledByKind = entity.cancelledByKind;
    dto.scheduledPickupAt = entity.scheduledPickupAt?.toISOString() ?? null;
    dto.requestedAt = entity.requestedAt.toISOString();
    dto.preparingAt = entity.preparingAt?.toISOString() ?? null;
    dto.readyAt = entity.readyAt?.toISOString() ?? null;
    dto.deliveredAt = entity.deliveredAt?.toISOString() ?? null;
    dto.cancelledAt = entity.cancelledAt?.toISOString() ?? null;
    dto.preparingById = entity.preparingById;
    dto.readyById = entity.readyById;
    dto.deliveredById = entity.deliveredById;
    dto.cancelledById = entity.cancelledById;
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    dto.events = entity.events.map((e) => ({
      id: e.id,
      status: e.status,
      note: e.note,
      actorId: e.actorId,
      createdAt: e.createdAt.toISOString(),
    }));
    dto.customer = entity.customer
      ? {
          id: entity.customer.id,
          customerNumber: entity.customer.customerNumber,
          firstName: entity.customer.firstName,
          lastName: entity.customer.lastName,
          mobile: entity.customer.mobile,
        }
      : null;
    dto.fee = entity.charge
      ? {
          code: entity.charge.code,
          labelFa: entity.charge.labelFa,
          mode: entity.charge.mode,
          rateValue: entity.charge.rateValue.toFixed(6),
          calculationBase: entity.charge.calculationBase,
          baseAmountRial: entity.charge.baseAmountRial.toFixed(2),
          amountRial: entity.charge.amountRial.toFixed(2),
          goldPricePerGramRial: entity.charge.goldPricePerGramRial?.toFixed(2) ?? null,
          status: entity.charge.status,
          walletAvailableAfterRial: entity.charge.walletAvailableAfterRial?.toFixed(2) ?? null,
          reservedAt: entity.charge.reservedAt?.toISOString() ?? null,
          settledAt: entity.charge.settledAt?.toISOString() ?? null,
          releasedAt: entity.charge.releasedAt?.toISOString() ?? null,
        }
      : null;
    dto.goldPricePerGramRial = entity.charge?.goldPricePerGramRial?.toFixed(2) ?? null;
    dto.documents = {
      preInvoiceAvailable: !!entity.preInvoiceKey,
      invoiceAvailable: !!entity.invoiceKey,
    };
    return dto;
  }
}
