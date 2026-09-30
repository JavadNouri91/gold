export interface KycDocumentType {
  value: string;
  label: string;
  /** `all` is required for every customer. `PARTNER` is required for همکار customers. */
  requiredFor: 'all' | 'PARTNER';
}

/** docs/21 §7.1 and Questions.txt Q5.1 */
export const KYC_DOCUMENT_TYPES: KycDocumentType[] = [
  { value: 'national_id_front', label: 'روی کارت ملی', requiredFor: 'all' },
  { value: 'national_id_back', label: 'پشت کارت ملی', requiredFor: 'all' },
  { value: 'birth_certificate', label: 'شناسنامه', requiredFor: 'all' },
  { value: 'proof_of_address', label: 'مدرک محل سکونت', requiredFor: 'all' },
  { value: 'selfie_with_id', label: 'سلفی همراه با مدرک شناسایی', requiredFor: 'all' },
  { value: 'personal_photo', label: 'عکس پرسنلی', requiredFor: 'all' },
  { value: 'business_registration', label: 'جواز کسب', requiredFor: 'PARTNER' },
];

const LEGACY_LABELS: Record<string, string> = {
  NATIONAL_ID: 'کارت ملی',
  BIRTH_CERTIFICATE: 'شناسنامه',
  PASSPORT: 'پاسپورت',
  DRIVER_LICENSE: 'گواهینامه',
  UTILITY_BILL: 'قبض آب، برق یا گاز',
  BANK_STATEMENT: 'صورت‌حساب بانکی',
};

export function kycDocumentLabel(type: string): string {
  return KYC_DOCUMENT_TYPES.find((item) => item.value === type)?.label ?? LEGACY_LABELS[type] ?? type;
}

export function requiredKycDocumentTypes(customerType: string | null | undefined): KycDocumentType[] {
  return KYC_DOCUMENT_TYPES.filter(
    (item) => item.requiredFor === 'all' || item.requiredFor === customerType,
  );
}
