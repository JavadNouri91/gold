import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { StorageService } from '../../../common/storage/storage.service';

export interface PickupDocumentCustomer {
  id: string;
  customerNumber: string;
  name: string;
  mobile: string;
  customerType: string | null;
}

export interface PickupDocumentFee {
  code: string;
  labelFa: string;
  mode: string;
  rateValue: Decimal;
  calculationBase: string | null;
  baseAmountRial: Decimal;
  amountRial: Decimal;
  goldPricePerGramRial: Decimal | null;
  status: string;
  walletAvailableAfterRial: Decimal | null;
}

export interface PickupDocumentData {
  documentType: 'PRE_INVOICE' | 'INVOICE';
  pickupNumber: string;
  generatedAt: Date;
  customer: PickupDocumentCustomer;
  weightGrams: Decimal;
  purityRatio: Decimal;
  status: string;
  fee: PickupDocumentFee | null;
}

export interface GeneratedPickupDocument {
  key: string;
  mimeType: string;
  generatedAt: Date;
}

/**
 * Generates immutable JSON pre-invoice (at request) and invoice (at delivery)
 * documents for physical gold pickups, stored via the global StorageService.
 *
 * These documents only carry the conversion/delivery fee — the gold value was
 * settled in the original buy transaction and is NOT re-charged here.
 */
@Injectable()
export class PickupDocumentService {
  private readonly logger = new Logger(PickupDocumentService.name);

  constructor(private readonly storageService: StorageService) {}

  async generate(data: PickupDocumentData): Promise<GeneratedPickupDocument | null> {
    try {
      const content = this.buildDocumentContent(data);
      const jsonBuffer = Buffer.from(JSON.stringify(content, null, 2), 'utf-8');
      const objectName =
        data.documentType === 'PRE_INVOICE' ? 'pre-invoice.json' : 'invoice.json';
      const prefix = `pickups/${data.pickupNumber}`;
      const mimeType = 'application/json';

      const stored = await this.storageService.upload({
        buffer: jsonBuffer,
        originalName: objectName,
        mimeType,
        sizeBytes: jsonBuffer.byteLength,
        prefix,
      });

      this.logger.log(`Pickup document generated: ${stored.key}`);
      return { key: stored.key, mimeType, generatedAt: new Date() };
    } catch (err) {
      this.logger.warn(
        `Pickup document generation failed for ${data.pickupNumber}. ` +
          `Pickup proceeds without a stored document. Error: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async read(documentKey: string): Promise<Buffer> {
    return this.storageService.getObject(documentKey);
  }

  private buildDocumentContent(data: PickupDocumentData): object {
    const isPreInvoice = data.documentType === 'PRE_INVOICE';
    return {
      _meta: {
        documentType: data.documentType,
        schemaVersion: '1.0',
        generatedAt: data.generatedAt.toISOString(),
        legalNotice:
          'بهای طلا در معامله خرید قبلی تسویه شده؛ این سند فقط کارمزد تبدیل/تحویل است. ' +
          '(The gold value was settled in the original buy transaction; this document only covers the conversion/delivery fee.)',
      },
      pickup: {
        pickupNumber: data.pickupNumber,
        status: data.status,
        weightGrams: data.weightGrams.toFixed(6),
        purityRatio: data.purityRatio.toFixed(6),
      },
      customer: {
        id: data.customer.id,
        customerNumber: data.customer.customerNumber,
        name: data.customer.name,
        mobile: data.customer.mobile,
        type: data.customer.customerType,
      },
      fee: data.fee
        ? {
            code: data.fee.code,
            labelFa: data.fee.labelFa,
            mode: data.fee.mode,
            rateValue: data.fee.rateValue.toFixed(6),
            calculationBase: data.fee.calculationBase,
            baseAmountRial: data.fee.baseAmountRial.toFixed(2),
            amountRial: data.fee.amountRial.toFixed(2),
            goldPricePerGramRial: data.fee.goldPricePerGramRial?.toFixed(2) ?? null,
            chargeStatus: data.fee.status,
            walletAvailableAfterRial: data.fee.walletAvailableAfterRial?.toFixed(2) ?? null,
          }
        : null,
      lifecycle: {
        stage: isPreInvoice ? 'RESERVED_AT_REQUEST' : 'SETTLED_AT_DELIVERY',
      },
    };
  }
}
