import { IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { LatinDigits } from '../../../../common/latin-digits.decorator';
import { PaymentMethod } from '../../domain/constants/payment-methods';

/** Positive IRR amount: Latin digits, optional decimal part. */
const AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

/**
 * Record Payment DTO
 *
 * Input for recording a new payment against a confirmed Trade.
 * docs/21-business-decisions.md §9.1
 */
export class RecordPaymentDto {
  /** Unique key per submission — prevents duplicate payment records. */
  @IsString({ message: 'شناسه یکتای پرداخت الزامی است' })
  @MinLength(8, { message: 'شناسه یکتای پرداخت معتبر نیست' })
  @MaxLength(120)
  idempotencyKey!: string;

  /** ID of the confirmed Trade this payment is for. */
  @IsString({ message: 'معامله را انتخاب کنید' })
  @MinLength(5, { message: 'معامله را انتخاب کنید' })
  @MaxLength(64)
  tradeId!: string;

  /**
   * Payment method.
   * Supported MVP methods: BANK_TRANSFER, CARD_TO_CARD, CASH (§9.1).
   * Online gateway: DEFERRED (§13.7).
   */
  @IsIn(Object.values(PaymentMethod), { message: 'روش پرداخت نامعتبر است' })
  method!: PaymentMethod;

  /** Payment amount in IRR (Rial). Must be positive. BR-P05: Decimal only. */
  @LatinDigits()
  @IsString({ message: 'مبلغ پرداخت را وارد کنید' })
  @Matches(AMOUNT_PATTERN, { message: 'مبلغ پرداخت باید به ریال و فقط با رقم باشد' })
  @MaxLength(24)
  amount!: string; // string input — converted to Decimal in service

  /** External bank reference or transfer confirmation number.
   * Required for BANK_TRANSFER and CARD_TO_CARD. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNumber?: string;

  /** Accountant notes. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  /** When the physical payment was received (ISO 8601). */
  @IsOptional()
  @IsString()
  @IsISO8601({}, { message: 'زمان دریافت پرداخت معتبر نیست' })
  receivedAt?: string;
}

/**
 * Allocate Payment DTO
 *
 * Input for allocating a validated payment to a Trade.
 */
export class AllocatePaymentDto {
  @IsString({ message: 'معامله را انتخاب کنید' })
  @MinLength(5, { message: 'معامله را انتخاب کنید' })
  @MaxLength(64)
  tradeId!: string;

  /** Amount to allocate (must be > 0 and <= remaining Trade balance). */
  @LatinDigits()
  @IsString({ message: 'مبلغ تخصیص را وارد کنید' })
  @Matches(AMOUNT_PATTERN, { message: 'مبلغ تخصیص باید به ریال و فقط با رقم باشد' })
  @MaxLength(24)
  amount!: string; // Decimal string
}

/**
 * Validate Payment DTO
 *
 * Input for marking a PENDING payment as VALIDATED (accountant confirmation).
 */
export class ValidatePaymentDto {
  /** Optional note from accountant. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/**
 * Withdrawal request DTO
 *
 * Customer requests a withdrawal to one of their own verified bank accounts.
 * The amount is a Rial (IRR) decimal string.
 */
export class CreateWithdrawalDto {
  /** Withdrawal amount in IRR (Rial). Must be positive. */
  @LatinDigits()
  @IsString({ message: 'مبلغ برداشت را وارد کنید' })
  @Matches(AMOUNT_PATTERN, { message: 'مبلغ برداشت باید به ریال و فقط با رقم باشد' })
  @MaxLength(24)
  amount!: string;

  /** ID of the customer's own verified bank account (destination). */
  @IsString({ message: 'حساب مقصد را انتخاب کنید' })
  @MinLength(5, { message: 'حساب مقصد را انتخاب کنید' })
  @MaxLength(64)
  bankAccountId!: string;
}
