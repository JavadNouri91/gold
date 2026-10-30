import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsProvider, SmsDeliveryResult, SmsRuntimeConfig } from './sms-provider.interface';

/**
 * SMS.ir Provider Adapter
 *
 * docs/21-business-decisions.md §10.1 — one of the two candidate providers.
 *
 * Selected by the `provider` value of the resolved SMS settings
 * (admin panel → settings → SMS, or SMS_PROVIDER in .env).
 *
 * Uses SMS.ir REST API v1.
 * Credentials come from the resolved config; the env config is the fallback
 * for callers that inject this provider directly.
 * Base URL override: SMSIR_BASE_URL (default: https://api.sms.ir/v1).
 *
 * SECURITY:
 * - API key comes from configuration — NEVER hard-coded.
 * - Error responses do NOT include the API key.
 */
@Injectable()
export class SmsSirProvider implements SmsProvider {
  private readonly logger = new Logger(SmsSirProvider.name);
  readonly providerName = 'smsir';

  constructor(private readonly configService: ConfigService) {}

  async send(to: string, message: string, config?: SmsRuntimeConfig): Promise<SmsDeliveryResult> {
    const resolved = config ?? this.envConfig();
    const { apiKey, senderLine, smsirBaseUrl: baseUrl } = resolved;

    if (!apiKey) {
      return { success: false, error: 'SMS_API_KEY not configured' };
    }
    if (!senderLine) {
      return { success: false, error: 'SMS_SENDER_LINE not configured' };
    }

    try {
      const response = await fetch(`${baseUrl}/send/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
        },
        body: JSON.stringify({
          // SMS.ir expects a numeric line number; keep the string only as a last resort.
          lineNumber: /^\d+$/.test(senderLine) ? Number(senderLine) : senderLine,
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
        message?: string;
        /** /send/bulk returns an array of message ids; other endpoints return a scalar. */
        data?: number | number[] | { messageId?: number };
        messageId?: number;
      };

      if (data.status === 1) {
        const reference = data.messageId ?? data.data;
        return {
          success: true,
          providerReference: reference == null ? '' : String(reference),
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

  private envConfig(): SmsRuntimeConfig {
    const smsConfig = this.configService.get('sms');
    return {
      provider: 'smsir',
      apiKey: (smsConfig?.apiKey as string) ?? '',
      senderLine: (smsConfig?.senderLine as string) ?? '',
      smsirBaseUrl: (smsConfig?.smsirBaseUrl as string) ?? 'https://api.sms.ir/v1',
      melipayamakBaseUrl:
        (smsConfig?.melipayamakBaseUrl as string) ?? 'https://rest.payamak-panel.com/api/SendSMS',
      melipayamakPassword: (smsConfig?.melipayamakPassword as string) ?? '',
    };
  }
}
