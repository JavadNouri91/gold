import {
  CustomerAccountStatus,
  CustomerGender,
  CustomerLevel,
  CustomerStatus,
  CustomerType,
  ReferenceSource,
} from '@gold/shared-types';
import { CustomerEntity } from '../../domain/entities/customer.entity';

export class CustomerResponseDto {
  id: string;
  customerNumber: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  nationalId: string;
  mobile: string;
  email: string | null;
  dateOfBirth: Date | null;
  address: string | null;
  hasAvatar: boolean;
  type: CustomerType | null;
  gender: CustomerGender | null;
  level: CustomerLevel | null;
  postalCode: string | null;
  phone: string | null;
  referenceSource: ReferenceSource | null;
  companyName: string | null;
  companyNationalId: string | null;
  companyEconomicId: string | null;
  contactName: string | null;
  contactTitle: string | null;
  secondaryMobile: string | null;
  workPhone: string | null;
  fax: string | null;
  workAddress: string | null;
  contactNotes: string | null;
  province: string | null;
  city: string | null;
  status: CustomerStatus;
  accountStatus: CustomerAccountStatus;
  rejectionReason: string | null;
  isTradeEligible: boolean;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(entity: CustomerEntity): CustomerResponseDto {
    const dto = new CustomerResponseDto();
    dto.id = entity.id;
    dto.customerNumber = entity.customerNumber;
    dto.userId = entity.userId;
    dto.firstName = entity.firstName;
    dto.lastName = entity.lastName;
    dto.fullName = entity.fullName;
    dto.nationalId = entity.nationalId;
    dto.mobile = entity.mobile;
    dto.email = entity.email;
    dto.dateOfBirth = entity.dateOfBirth;
    dto.address = entity.address;
    dto.hasAvatar = Boolean(entity.avatarKey);
    dto.type = entity.type;
    dto.gender = entity.gender;
    dto.level = entity.level;
    dto.postalCode = entity.postalCode;
    dto.phone = entity.phone;
    dto.referenceSource = entity.referenceSource;
    dto.companyName = entity.companyName;
    dto.companyNationalId = entity.companyNationalId;
    dto.companyEconomicId = entity.companyEconomicId;
    dto.contactName = entity.contactName;
    dto.contactTitle = entity.contactTitle;
    dto.secondaryMobile = entity.secondaryMobile;
    dto.workPhone = entity.workPhone;
    dto.fax = entity.fax;
    dto.workAddress = entity.workAddress;
    dto.contactNotes = entity.contactNotes;
    dto.province = entity.province;
    dto.city = entity.city;
    dto.status = entity.status;
    dto.accountStatus = entity.accountStatus;
    dto.rejectionReason = entity.rejectionReason;
    dto.isTradeEligible = entity.isTradeEligible();
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
