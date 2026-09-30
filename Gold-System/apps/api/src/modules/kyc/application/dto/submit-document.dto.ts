import { IsString, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Document types (docs/21-business-decisions.md §7.1)
 * Stored in config — not hard-coded in enum to allow runtime configuration.
 *
 * Default types:
 *   national_id_front     — required for all
 *   national_id_back      — required for all
 *   birth_certificate     — required for all
 *   proof_of_address      — required for all
 *   selfie_with_id        — required for all
 *   personal_photo        — required for all
 *   business_registration — required for PARTNER customers only
 */
export const KNOWN_DOCUMENT_TYPES = [
  'national_id_front',
  'national_id_back',
  'birth_certificate',
  'proof_of_address',
  'selfie_with_id',
  'personal_photo',
  'business_registration',
] as const;

export type KnownDocumentType = (typeof KNOWN_DOCUMENT_TYPES)[number];

export class SubmitDocumentDto {
  @ApiProperty({
    description: 'Document type key (see §7.1 of business-decisions.md)',
    example: 'national_id_front',
    enum: KNOWN_DOCUMENT_TYPES,
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(KNOWN_DOCUMENT_TYPES)
  documentType: KnownDocumentType;
}
