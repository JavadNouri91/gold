import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { SmsSettingsService } from './sms-settings.service';

export interface SmsCreditResult {
  /** Panel credit reported by the provider, null when unavailable. */
  credit: number | null;
  provider: string;
  /** True when the provider answered successfully. */
  available: boolean;
  /** Human-readable reason when available is false. */
  message: string | null;
  /** ISO timestamp of the check. */
  checkedAt: string;
}

/**
 * Reads the current panel credit so an administrator can spot a drained
 * account before OTP delivery starts failing.
 *
 * The provider key never leaves the server: the browser calls this service,
 * which calls the provider. Only SMS.ir exposes a credit endpoint; other
 * providers report `available: false` instead of pretending.
 */
@Injectable()
export class SmsCreditService {
  private readonly logger = new Logger(SmsCreditService.name);

  constructor(private readonly settings: SmsSettingsService) {}

  async getCredit(): Promise<SmsCreditResult> {
    const config = await this.settings.resolveEffectiveConfig();
    const checkedAt = new Date().toISOString();

    if (config.provider === 'mock') {
      return {
        credit: null,
        provider: config.provider,
        available: false,
        message: 'در حالت آزمایشی اعتبار پنل معنایی ندارد.',
        checkedAt,
      };
    }

    if (config.provider !== 'smsir') {
      return {
        credit: null,
        provider: config.provider,
        available: false,
        message: 'خواندن اعتبار فقط برای SMS.ir پشتیبانی می‌شود.',
        checkedAt,
      };
    }

    if (!config.apiKey) {
      return {
        credit: null,
        provider: config.provider,
        available: false,
        message: 'کلید API تنظیم نشده است.',
        checkedAt,
      };
    }

    try {
      const response = await fetch(`${config.smsirBaseUrl}/credit`, {
        method: 'GET',
        headers: { 'X-API-KEY': config.apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.error(`[SMS.ir credit] HTTP ${response.status}: ${text.substring(0, 200)}`);
        throw new BadGatewayException(`سرویس اعتبار پیامک پاسخ نداد (HTTP ${response.status}).`);
      }

      const data = (await response.json()) as {
        status?: number;
        data?: number | null;
        message?: string;
      };

      if (data.status !== 1) {
        // status 10 = invalid web-service key — the panel must be corrected.
        this.logger.warn(`[SMS.ir credit] status=${data.status} message=${data.message}`);
        return {
          credit: null,
          provider: config.provider,
          available: false,
          message: data.message ?? `SMSIR_STATUS_${data.status}`,
          checkedAt,
        };
      }

      const credit = typeof data.data === 'number' ? data.data : null;
      return {
        credit,
        provider: config.provider,
        available: credit !== null,
        message: null,
        checkedAt,
      };
    } catch (err: unknown) {
      if (err instanceof BadGatewayException) throw err;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[SMS.ir credit] network/timeout: ${message}`);
      throw new BadGatewayException('ارتباط با سرویس پیامک برقرار نشد.');
    }
  }
}
