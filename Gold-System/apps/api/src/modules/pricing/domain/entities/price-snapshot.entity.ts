import Decimal from 'decimal.js';

export type PriceSnapshotStatus = 'VALID' | 'STALE' | 'INVALID';

/**
 * PriceSnapshot — immutable capture of an external gold price.
 *
 * Once created, this entity is NEVER modified (§7 historical immutability).
 *
 * normalizedValue = Rial per gram of reference purity (canonical internal unit).
 * The mock normalizer sets normalizedValue = rawValue (passthrough).
 * The real normalizer implements §1.5 once §13.1 is resolved.
 */
export class PriceSnapshotEntity {
  readonly id: string;
  readonly sourceId: string;
  readonly rawValue: Decimal;
  readonly normalizedValue: Decimal;
  readonly unit: string;
  readonly currency: string;
  readonly purityReference: string | null;
  readonly externalRef: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly capturedAt: Date;
  readonly validityStatus: PriceSnapshotStatus;
  readonly createdAt: Date;

  constructor(props: {
    id: string;
    sourceId: string;
    rawValue: Decimal;
    normalizedValue: Decimal;
    unit: string;
    currency: string;
    purityReference: string | null;
    externalRef: string | null;
    metadata: Record<string, unknown> | null;
    capturedAt: Date;
    validityStatus: PriceSnapshotStatus;
    createdAt: Date;
  }) {
    Object.assign(this, props);
  }

  isValid(): boolean {
    return this.validityStatus === 'VALID';
  }

  /**
   * Check if this snapshot is within the acceptable staleness threshold.
   * @param maxAgeSeconds Maximum allowed age in seconds
   */
  isWithinTtl(maxAgeSeconds: number): boolean {
    const ageMs = Date.now() - this.capturedAt.getTime();
    return ageMs <= maxAgeSeconds * 1000;
  }
}
