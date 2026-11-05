import { Matches } from 'class-validator';
import { LatinDigits } from '../../../../common/latin-digits.decorator';

export class CompleteIdentityDto {
  @LatinDigits()
  @Matches(/^\d{10}$/, { message: 'کد ملی باید ده رقم باشد.' })
  nationalId: string;
}
