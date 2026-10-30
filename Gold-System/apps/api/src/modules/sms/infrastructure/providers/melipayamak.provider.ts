import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsProvider, SmsDeliveryResult, SmsRuntimeConfig } from './sms-provider.interface';

/**
 * Melipayamak Provider Adapter
 *
 * docs/21-business-decisions.md §10.1 — one of the two candidate providers.
 *
 * Selected by the `provider` value of the resolved SMS settings
 * (admin panel → settings → SMS, or SMS_PROVIDER in .env).
 *
 * Uses Melipayamak REST API.
 * Credentials come from the resolved config; the env config is the fallback
 * for callers that inject this provider directly.
 * Base URL override: MELIPAYAMAK_BASE_URL.
 *
 * SECURITY:
 * - Credentials come from configuration — NEVER hard-coded.
 */
@Injectable()
export class MelipayamakProvider implements SmsProvider {
  private readonly logger = new Logger(MelipayamakProvider.name);
  readonly providerName = 'melipayamak';

  constructor(private readonly configService: ConfigService) {}

  async send(to: string, message: string, config?: SmsRuntimeConfig): Promise<SmsDeliveryResult> {
    const resolved = config ?? this.envConfig();
    const username = resolved.apiKey;
    const password = resolved.melipayamakPassword;
    const from = resolved.senderLine;
    const baseUrl = resolved.melipayamakBaseUrl;

    if (!username || !password) {
      return { success: false, error: 'Melipayamak credentials not configured' };
    }
    if (!from) {
      return { success: false, error: 'SMS_SENDER_LINE not configured' };
    }

    try {
      const response = await fetch(`${baseUrl}/sendSimpleSMS2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, from, to, text: message }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.error(`[Melipayamak] HTTP ${response.status}: ${text.substring(0, 200)}`);
        return { success: false, error: `HTTP_${response.status}` };
      }

      const data = (await response.json()) as { Value?: string; RetStatus?: number };

      // Melipayamak returns RetStatus 1 for success
      if (data.RetStatus === 1) {
        return {
          success: true,
          providerReference: data.Value ?? '',
        };
      }

      this.logger.error(`[Melipayamak] API error: RetStatus=${data.RetStatus} Value=${data.Value}`);
      return { success: false, error: `MELIPAYAMAK_STATUS_${data.RetStatus}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Melipayamak] Network/timeout error: ${msg}`);
      return { success: false, error: `NETWORK_ERROR: ${msg}` };
    }
  }

  private envConfig(): SmsRuntimeConfig {
    const smsConfig = this.configService.get('sms');
    return {
      provider: 'melipayamak',
      apiKey: (smsConfig?.apiKey as string) ?? '',
      senderLine: (smsConfig?.senderLine as string) ?? '',
      smsirBaseUrl: (smsConfig?.smsirBaseUrl as string) ?? 'https://api.sms.ir/v1',
      melipayamakBaseUrl:
        (smsConfig?.melipayamakBaseUrl as string) ?? 'https://rest.payamak-panel.com/api/SendSMS',
      melipayamakPassword: (smsConfig?.melipayamakPassword as string) ?? '',
    };
  }
}
