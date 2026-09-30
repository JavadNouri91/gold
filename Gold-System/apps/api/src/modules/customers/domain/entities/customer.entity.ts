import {
  CustomerAccountStatus,
  CustomerGender,
  CustomerLevel,
  CustomerStatus,
  CustomerType,
  ReferenceSource,
} from '@gold/shared-types';

/**
 * Customer domain entity — immutable value object
 *
 * State machine (architecture/STATE-MACHINES.md):
 *   PENDING → UNDER_REVIEW → APPROVED → ACTIVE
 *                          └→ REJECTED
 *   ACTIVE  → SUSPENDED | BLOCKED
 *
 * BR-C02: type ∈ {HOUSEHOLD, PARTNER, VIP, WHOLESALE, CORPORATE}
 * BR-C03: type changes must be audited
 */
export class CustomerEntity {
  readonly id: string;
  readonly customerNumber: string;
  readonly userId: string | null;

  readonly firstName: string;
  readonly lastName: string;
  readonly nationalId: string;
  readonly mobile: string;
  readonly email: string | null;
  readonly dateOfBirth: Date | null;
  readonly address: string | null;
  readonly avatarKey: string | null;

  readonly type: CustomerType | null;
  readonly gender: CustomerGender | null;
  readonly level: CustomerLevel | null;
  readonly postalCode: string | null;
  readonly phone: string | null;
  readonly referenceSource: ReferenceSource | null;

  // Company / corporate fields
  readonly companyName: string | null;
  readonly companyNationalId: string | null;
  readonly companyEconomicId: string | null;
  readonly contactName: string | null;
  readonly contactTitle: string | null;

  // Extended contact fields
  readonly secondaryMobile: string | null;
  readonly workPhone: string | null;
  readonly fax: string | null;
  readonly workAddress: string | null;
  readonly contactNotes: string | null;
  readonly province: string | null;
  readonly city: string | null;

  readonly status: CustomerStatus;
  readonly accountStatus: CustomerAccountStatus;
  readonly rejectionReason: string | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: {
    id: string;
    customerNumber: string;
    userId: string | null;
    firstName: string;
    lastName: string;
    nationalId: string;
    mobile: string;
    email: string | null;
    dateOfBirth: Date | null;
    address: string | null;
    avatarKey?: string | null;
    type: CustomerType | null;
    gender?: CustomerGender | null;
    level?: CustomerLevel | null;
    postalCode?: string | null;
    phone?: string | null;
    referenceSource?: ReferenceSource | null;
    companyName?: string | null;
    companyNationalId?: string | null;
    companyEconomicId?: string | null;
    contactName?: string | null;
    contactTitle?: string | null;
    secondaryMobile?: string | null;
    workPhone?: string | null;
    fax?: string | null;
    workAddress?: string | null;
    contactNotes?: string | null;
    province?: string | null;
    city?: string | null;
    status: CustomerStatus;
    accountStatus?: CustomerAccountStatus;
    rejectionReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    Object.assign(this, props);
    this.accountStatus = props.accountStatus ?? CustomerAccountStatus.ACTIVE;
    this.gender = props.gender ?? null;
    this.level = props.level ?? null;
    this.postalCode = props.postalCode ?? null;
    this.phone = props.phone ?? null;
    this.referenceSource = props.referenceSource ?? null;
    this.companyName = props.companyName ?? null;
    this.companyNationalId = props.companyNationalId ?? null;
    this.companyEconomicId = props.companyEconomicId ?? null;
    this.contactName = props.contactName ?? null;
    this.contactTitle = props.contactTitle ?? null;
    this.secondaryMobile = props.secondaryMobile ?? null;
    this.workPhone = props.workPhone ?? null;
    this.fax = props.fax ?? null;
    this.workAddress = props.workAddress ?? null;
    this.contactNotes = props.contactNotes ?? null;
    this.province = props.province ?? null;
    this.city = props.city ?? null;
    this.avatarKey = props.avatarKey ?? null;
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  /** Whether the customer can submit orders (BR-C01) */
  isTradeEligible(): boolean {
    return (
      this.status === CustomerStatus.ACTIVE &&
      this.accountStatus === CustomerAccountStatus.ACTIVE &&
      this.type !== null
    );
  }

  isKycApproved(): boolean {
    return this.status === CustomerStatus.APPROVED || this.status === CustomerStatus.ACTIVE;
  }

  /** Transition: PENDING → UNDER_REVIEW */
  canStartReview(): boolean {
    return this.status === CustomerStatus.PENDING;
  }

  /** Transition: UNDER_REVIEW → APPROVED */
  canApprove(): boolean {
    return this.status === CustomerStatus.UNDER_REVIEW;
  }

  /** Transition: UNDER_REVIEW → REJECTED */
  canReject(): boolean {
    return this.status === CustomerStatus.UNDER_REVIEW;
  }

  /** Type can be assigned only after approval */
  canAssignType(): boolean {
    return this.status === CustomerStatus.APPROVED || this.status === CustomerStatus.ACTIVE;
  }
}
