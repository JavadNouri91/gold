import Decimal from 'decimal.js';
import {
  PhysicalGoldPickupStatus,
  PICKUP_TRANSITIONS,
} from '../constants/pickup-states';

export interface PickupEventSnapshot {
  id: string;
  status: PhysicalGoldPickupStatus;
  note: string | null;
  actorId: string | null;
  createdAt: Date;
}

export interface PickupCustomerSnapshot {
  id: string;
  customerNumber: string;
  firstName: string;
  lastName: string;
  mobile: string;
  type: string | null;
}

export interface PickupChargeSnapshotData {
  id: string;
  code: string;
  labelFa: string;
  mode: string;
  rateValue: Decimal;
  calculationBase: string | null;
  baseAmountRial: Decimal;
  amountRial: Decimal;
  goldPricePerGramRial: Decimal | null;
  policyId: string | null;
  status: string;
  walletAvailableAfterRial: Decimal | null;
  reservedAt: Date | null;
  settledAt: Date | null;
  releasedAt: Date | null;
}

export class PhysicalGoldPickupEntity {
  readonly id: string;
  readonly pickupNumber: string;
  readonly customerId: string;
  readonly storeId: string;
  readonly weightGrams: Decimal;
  readonly purityRatio: Decimal;
  readonly status: PhysicalGoldPickupStatus;
  readonly customerNote: string | null;
  readonly staffNote: string | null;
  readonly cancelReason: string | null;
  /** CUSTOMER | STAFF when status is CANCELLED. */
  readonly cancelledByKind: 'CUSTOMER' | 'STAFF' | null;
  readonly scheduledPickupAt: Date | null;
  readonly requestedAt: Date;
  readonly preparingAt: Date | null;
  readonly readyAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly preparingById: string | null;
  readonly readyById: string | null;
  readonly deliveredById: string | null;
  readonly cancelledById: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly events: PickupEventSnapshot[];
  readonly customer: PickupCustomerSnapshot | null;
  readonly charge: PickupChargeSnapshotData | null;
  readonly preInvoiceKey: string | null;
  readonly preInvoiceMimeType: string | null;
  readonly preInvoiceGeneratedAt: Date | null;
  readonly invoiceKey: string | null;
  readonly invoiceMimeType: string | null;
  readonly invoiceGeneratedAt: Date | null;

  constructor(data: {
    id: string;
    pickupNumber: string;
    customerId: string;
    storeId: string;
    weightGrams: Decimal.Value;
    purityRatio: Decimal.Value;
    status: PhysicalGoldPickupStatus;
    customerNote: string | null;
    staffNote: string | null;
    cancelReason: string | null;
    cancelledByKind?: 'CUSTOMER' | 'STAFF' | null;
    scheduledPickupAt?: Date | null;
    requestedAt: Date;
    preparingAt: Date | null;
    readyAt: Date | null;
    deliveredAt: Date | null;
    cancelledAt: Date | null;
    preparingById: string | null;
    readyById: string | null;
    deliveredById: string | null;
    cancelledById: string | null;
    createdAt: Date;
    updatedAt: Date;
    events?: PickupEventSnapshot[];
    customer?: PickupCustomerSnapshot | null;
    charge?: PickupChargeSnapshotData | null;
    preInvoiceKey?: string | null;
    preInvoiceMimeType?: string | null;
    preInvoiceGeneratedAt?: Date | null;
    invoiceKey?: string | null;
    invoiceMimeType?: string | null;
    invoiceGeneratedAt?: Date | null;
  }) {
    this.id = data.id;
    this.pickupNumber = data.pickupNumber;
    this.customerId = data.customerId;
    this.storeId = data.storeId;
    this.weightGrams = new Decimal(data.weightGrams.toString());
    this.purityRatio = new Decimal(data.purityRatio.toString());
    this.status = data.status;
    this.customerNote = data.customerNote;
    this.staffNote = data.staffNote;
    this.cancelReason = data.cancelReason;
    this.cancelledByKind = data.cancelledByKind ?? null;
    this.scheduledPickupAt = data.scheduledPickupAt ?? null;
    this.requestedAt = data.requestedAt;
    this.preparingAt = data.preparingAt;
    this.readyAt = data.readyAt;
    this.deliveredAt = data.deliveredAt;
    this.cancelledAt = data.cancelledAt;
    this.preparingById = data.preparingById;
    this.readyById = data.readyById;
    this.deliveredById = data.deliveredById;
    this.cancelledById = data.cancelledById;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.events = data.events ?? [];
    this.customer = data.customer ?? null;
    this.charge = data.charge ?? null;
    this.preInvoiceKey = data.preInvoiceKey ?? null;
    this.preInvoiceMimeType = data.preInvoiceMimeType ?? null;
    this.preInvoiceGeneratedAt = data.preInvoiceGeneratedAt ?? null;
    this.invoiceKey = data.invoiceKey ?? null;
    this.invoiceMimeType = data.invoiceMimeType ?? null;
    this.invoiceGeneratedAt = data.invoiceGeneratedAt ?? null;
  }

  canTransitionTo(next: PhysicalGoldPickupStatus): boolean {
    return PICKUP_TRANSITIONS[this.status].includes(next);
  }
}
