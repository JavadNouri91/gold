export interface NotificationRelationDto {
  kind: 'order' | 'trade' | 'payment' | 'quotation' | 'kyc' | 'settlement';
  href: string;
  number: string | null;
  amountRial: string | null;
  weightGrams: string | null;
  status: string | null;
  referenceNumber: string | null;
}
