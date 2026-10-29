import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsProvider, SmsDeliveryResult } from './sms-provider.interface';

/**
 * SMS.ir Provider Adapter
 *
 * docs/21-business-decisions.md §10.1 — one of the two candidate providers.
 * open-questions.md #31 — final selection TBD.
 *
 * Selected when SMS_PROVIDER=smsir.
 *
 * Uses SMS.ir REST API v1.
 * Credentials via env: SMS_API_KEY, SMS_SENDER_LINE.
 * Base URL override: SMSIR_BASE_URL (default: https://api.sms.ir/v1).
 *
 * SECURITY:
 * - API key comes from environment/config — NEVER hard-coded.
 * - Error responses do NOT include the API key.
 */
@Injectable()
export class SmsSirProvider implements SmsProvider {
  private readonly logger = new Logger(SmsSirProvider.name);
  readonly providerName = 'smsir';

  constructor(private readonly configService: ConfigService) {}

  async send(to: string, message: string): Promise<SmsDeliveryResult> {
    const smsConfig = this.configService.get('sms');
    const apiKey = smsConfig.apiKey as string;
    const senderLine = smsConfig.senderLine as string;
    const baseUrl = smsConfig.smsirBaseUrl as string;

    if (!apiKey) {
      return { success: false, error: 'SMS_API_KEY not configured' };
    }

    try {
      const response = await fetch(`${baseUrl}/send/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
        },
        body: JSON.stringify({
          lineNumber: senderLine,
          messageText: message,
          mobiles: [to],
        }),
        signal: AbortSignal.timeout(10_000), // 10s timeout
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.error(`[SMS.ir] HTTP ${response.status}: ${text.substring(0, 200)}`);
        return { success: false, error: `HTTP_${response.status}` };
      }

      const data = (await response.json()) as {
        status?: number;
        messageId?: number;
        message?: string;
      };

      if (data.status === 1) {
        return {
          success: true,
          providerReference: String(data.messageId ?? ''),
        };
      }

      this.logger.error(`[SMS.ir] API error: status=${data.status} message=${data.message}`);
      return { success: false, error: `SMSIR_STATUS_${data.status}` };
    } catch (err: unknown) {
      const message_ = err instanceof Error ? err.message : String(err);
      this.logger.error(`[SMS.ir] Network/timeout error: ${message_}`);
      return { success: false, error: `NETWORK_ERROR: ${message_}` };
    }
  }
}
