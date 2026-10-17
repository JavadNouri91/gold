import {
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreatePickupDto {
  /** Whole grams only — fractional pickup weights are not allowed. */
  @IsNotEmpty({ message: 'وزن طلا را وارد کنید.' })
  @IsNumberString({}, { message: 'وزن باید عدد صحیح گرم باشد.' })
  @Matches(/^[1-9]\d*$/, { message: 'وزن باید عدد صحیح گرم و بیشتر از صفر باشد.' })
  weightGrams!: string;

  /** Ignored — pickup purity is always 750 (0.750000). Kept optional for older clients. */
  @IsOptional()
  @IsNumberString({}, { message: 'عیار نامعتبر است.' })
  purityRatio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerNote?: string;
}

export class CancelPickupDto {
  @IsNotEmpty({ message: 'دلیل لغو را وارد کنید.' })
  @IsString({ message: 'دلیل لغو را وارد کنید.' })
  @MaxLength(500)
  reason!: string;
}

export class StaffPickupNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  staffNote?: string;
}

/** Staff starts PREPARING and must pick the planned in-store handover date. */
export class StaffMarkPreparingDto {
  /** Gregorian calendar date `YYYY-MM-DD` (Asia/Tehran). */
  @IsNotEmpty({ message: 'تاریخ تحویل را از تقویم انتخاب کنید.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ تحویل نامعتبر است.' })
  scheduledPickupAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  staffNote?: string;
}
