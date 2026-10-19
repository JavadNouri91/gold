/** Verified destination accounts shown on the withdrawal form until a bank-accounts API exists. */
export interface VerifiedBankAccount {
  id: string;
  bankName: string;
  bankCode: 'SAMAN' | 'MELLAT' | 'OTHER';
  /** Full IBAN without spaces (IR…). */
  iban: string;
  ibanMasked: string;
  accountHolder: string;
}

export const DEMO_VERIFIED_BANK_ACCOUNTS: VerifiedBankAccount[] = [
  {
    id: 'acc-saman',
    bankName: 'بانک سامان',
    bankCode: 'SAMAN',
    iban: 'IR1205600842000012348421',
    ibanMasked: 'IR12 … 8421',
    accountHolder: 'علی رضایی',
  },
  {
    id: 'acc-mellat',
    bankName: 'بانک ملت',
    bankCode: 'MELLAT',
    iban: 'IR1201200000000000003312',
    ibanMasked: 'IR12 … 3312',
    accountHolder: 'علی رضایی',
  },
];

/** Daily PAYA withdrawal ceiling in Rial (۵۰۰ میلیون تومان). */
export const DAILY_PAYA_LIMIT_RIAL = '5000000000';
