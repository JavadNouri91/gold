import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { StorageService } from '../../../common/storage/storage.service';

/**
 * Data needed to generate a Quotation document.
 * All monetary/weight values are Decimal — BR-P05 (never Float).
 */
export interface QuotationDocumentData {
  quotationNumber: string;
  orderNumber: string;
  version: number;
  generatedAt: Date;

  customer: {
    id: string;
    name: string;
    customerType: string | null;
  };

  items: Array<{
    weightGrams: Decimal;
    purityRatio: Decimal;
    unitPriceRial: Decimal;
    totalPriceRial: Decimal;
  }>;

  pricing: {
    step1BasePrice: Decimal | null;
    wageAmount: Decimal | null;
    discountAmount: Decimal | null;
    roundingAmount: Decimal | null;
    totalAmountRial: Decimal;
    isComplete: boolean;
    /** BLOCKED steps — profit (§13.2) and tax (§13.3) */
    blockedSteps: string[];
  };
}

export interface GeneratedDocument {
  /** S3/MinIO object key */
  key: string;
  mimeType: string;
  generatedAt: Date;
}

/**
 * Quotation Document Service.
 *
 * Generates the quotation document as a structured JSON snapshot and
 * uploads it to S3/MinIO via the existing StorageService.
 *
 * IMMUTABILITY GUARANTEE:
 *   The document is generated once from the locked PricingCalculation snapshot.
 *   It is NEVER regenerated due to gold price changes (§2.2).
 *   The document key stored on the Quotation record points to this immutable file.
 *
 * DOCUMENT FORMAT:
 *   JSON (application/json) — Phase 3.4 MVP.
 *   PDF upgrade can be added in a future phase without changing the interface.
 *
 * STORAGE:
 *   Uses the existing StorageService (S3/MinIO). Private bucket; access via signed URLs.
 *   Object key pattern: quotations/{quotationNumber}/v{version}.json
 *
 * FAILURE HANDLING:
 *   If document generation/upload fails, the caller logs the error and proceeds
 *   with documentKey=null. The document can be regenerated on demand.
 *   The Quotation record is created regardless.
 */
@Injectable()
export class QuotationDocumentService {
  private readonly logger = new Logger(QuotationDocumentService.name);

  constructor(private readonly storageService: StorageService) {}

  /**
   * Generates and uploads the quotation document.
   *
   * The document is a JSON snapshot of all pricing details.
   * Values are serialized as strings (Decimal.toFixed()) to preserve precision.
   *
   * @returns GeneratedDocument with S3 key, or null if upload fails (non-fatal).
   */
  async generate(data: QuotationDocumentData): Promise<GeneratedDocument | null> {
    try {
      const documentContent = this.buildDocumentContent(data);
      const jsonBuffer = Buffer.from(JSON.stringify(documentContent, null, 2), 'utf-8');

      const objectName = `v${data.version}.json`;
      const prefix = `quotations/${data.quotationNumber}`;
      const mimeType = 'application/json';

      const stored = await this.storageService.upload({
        buffer: jsonBuffer,
        originalName: objectName,
        mimeType,
        sizeBytes: jsonBuffer.byteLength,
        prefix,
      });

      this.logger.log(`Quotation document generated: ${stored.key}`);

      return {
        key: stored.key,
        mimeType,
        generatedAt: new Date(),
      };
    } catch (err) {
      this.logger.warn(
        `Quotation document generation failed for ${data.quotationNumber}. ` +
          `Quotation will be created without a document. Error: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Generates a pre-signed URL to download the quotation document.
   *
   * Every call to this method MUST be audited by the caller (BR-S02).
   */
  async getDownloadUrl(documentKey: string): Promise<string> {
    return this.storageService.getSignedUrl(documentKey);
  }

  /**
   * Builds the structured document content.
   *
   * All Decimal values serialized as strings to preserve precision.
   * IMMUTABLE SNAPSHOT — does not recalculate.
   */
  private buildDocumentContent(data: QuotationDocumentData): object {
    return {
      _meta: {
        documentType: 'QUOTATION',
        schemaVersion: '1.0',
        generatedAt: data.generatedAt.toISOString(),
        legalNotice:
          'این پیش‌فاکتور یک تأیید نهایی معامله نیست. ' +
          'این سند تأیید شرایط قیمتی در لحظه ثبت سفارش است و تا تأیید نهایی فروشنده معتبر است. ' +
          '(This quotation is NOT a trade confirmation. It represents the commercial terms locked at Order submission time.)',
        blockedSteps: data.pricing.blockedSteps,
        isComplete: data.pricing.isComplete,
      },
      quotation: {
        quotationNumber: data.quotationNumber,
        version: data.version,
        orderNumber: data.orderNumber,
      },
      customer: {
        id: data.customer.id,
        name: data.customer.name,
        type: data.customer.customerType,
      },
      items: data.items.map((item, idx) => ({
        lineNumber: idx + 1,
        weightGrams: item.weightGrams.toFixed(6),
        purityRatio: item.purityRatio.toFixed(6),
        unitPriceRial: item.unitPriceRial.toFixed(6),
        totalPriceRial: item.totalPriceRial.toFixed(2),
      })),
      pricing: {
        step1BasePrice: data.pricing.step1BasePrice?.toFixed(6) ?? null,
        wageAmount: data.pricing.wageAmount?.toFixed(2) ?? null,
        discountAmount: data.pricing.discountAmount?.toFixed(2) ?? null,
        roundingAmount: data.pricing.roundingAmount?.toFixed(2) ?? null,
        totalAmountRial: data.pricing.totalAmountRial.toFixed(2),
        // Profit and Tax are BLOCKED — §13.2 and §13.3
        profitAmount: null,
        taxAmount: null,
      },
    };
  }
}
