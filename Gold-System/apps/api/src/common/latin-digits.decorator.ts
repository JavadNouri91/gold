import { Transform } from 'class-transformer';
import { toLatinDigits } from './digits';

/** Normalize Persian and Arabic digits to Latin before validation. */
export function LatinDigits(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? toLatinDigits(value).trim() : value,
  );
}
