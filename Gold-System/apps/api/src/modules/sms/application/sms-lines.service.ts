import { Injectable, Logger } from '@nestjs/common';
import { SmsSettingsService } from './sms-settings.service';

export interface SmsLineListResult {
  /** Line numbers registered on the provider panel, ordered as returned. */
  lines: string[];
  provider: string;
  /** True when the provider answered successfully (even with zero lines). */
  available: boolean;
  /** Human-readable reason when available is false. */
  message: string | null;
  /** The sender line currently in effect, so the UI can preselect it. */
  current: string;
  checkedAt: string;
}

/**
 * Reads the sender lines registered on the provider panel.
 *
 * Purpose: let the admin pick the sender line from a real list instead of
 * typing it. A typo in `lineNumber` is one of the least obvious failure modes —
 * the provider rejects the send with a status code that says nothing about
 * the line, so the failure surfaces far away from the mistake.
 *
 * Read-only: never sends an SMS, and the API key stays on the server.
 */
@Injectable()
export class SmsLinesService {
  private readonly logger = new Logger(SmsLinesService.name);

  constructor(private readonly settings: SmsSettingsService) {}

  async listLines(): Promise<SmsLineListResult> {
    const config = await this.settings.resolveEffectiveConfig();
    const checkedAt = new Date().toISOString();
    const current = config.senderLine;

    if (config.provider === 'mock') {
      return {
        lines: [],
        provider: config.provider,
        available: false,
        message: 'در حالت آزمایشی خط فرستنده‌ای وجود ندارد.',
        current,
        checkedAt,
      };
    }

    if (config.provider !== 'smsir') {
      return {
        lines: [],
        provider: config.provider,
        available: false,
        message: 'دریافت لیست خطوط فقط برای SMS.ir پشتیبانی می‌شود.',
        current,
        checkedAt,
      };
    }

    if (!config.apiKey) {
      return {
        lines: [],
        provider: config.provider,
        available: false,
        message: 'برای دریافت لیست خطوط ابتدا کلید API را ذخیره کنید.',
        current,
        checkedAt,
      };
    }

    try {
      const response = await fetch(`${config.smsirBaseUrl}/line?Page=1&PageSize=100`, {
        method: 'GET',
        headers: {
          'X-API-KEY': config.apiKey,
          Accept: 'application/json',
          PageSize: '100',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.error(`[SMS.ir lines] HTTP ${response.status}: ${text.substring(0, 200)}`);
        return {
          lines: [],
          provider: config.provider,
          available: false,
          message: `دریافت لیست خطوط انجام نشد (HTTP ${response.status}).`,
          current,
          checkedAt,
        };
      }

      const data = (await response.json()) as {
        status?: number;
        message?: string;
        data?: Array<number | string> | null;
      };

      if (data.status !== 1) {
        this.logger.warn(`[SMS.ir lines] status=${data.status} message=${data.message}`);
        return {
          lines: [],
          provider: config.provider,
          available: false,
          message: data.message ?? `SMSIR_STATUS_${data.status}`,
          current,
          checkedAt,
        };
      }

      const lines = (data.data ?? [])
        .map((line) => String(line).trim())
        .filter((line) => line.length > 0);

      return {
        lines,
        provider: config.provider,
        available: true,
        message: null,
        current,
        checkedAt,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[SMS.ir lines] network/timeout: ${message}`);
      return {
        lines: [],
        provider: config.provider,
        available: false,
        message: 'ارتباط با سرویس پیامک برقرار نشد.',
        current,
        checkedAt,
      };
    }
  }
}
