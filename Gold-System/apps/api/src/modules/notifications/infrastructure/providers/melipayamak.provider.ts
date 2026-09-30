import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsProvider, SmsDeliveryResult } from './sms-provider.interface';

/**
 * Melipayamak Provider Adapter
 *
 * docs/21-business-decisions.md §10.1 — one of the two candidate providers.
 * open-questions.md #31 — final selection TBD.
 *
 * Selected when SMS_PROVIDER=melipayamak.
 *
 * Uses Melipayamak REST API.
 * Credentials via env: SMS_API_KEY (username), MELIPAYAMAK_PASSWORD, SMS_SENDER_LINE.
 * Base URL override: MELIPAYAMAK_BASE_URL.
 *
 * SECURITY:
 * - Credentials come from environment/config — NEVER hard-coded.
 */
@Injectable()
export class MelipayamakProvider implements SmsProvider {
  private readonly logger = new Logger(MelipayamakProvider.name);
  readonly providerName = 'melipayamak';

  constructor(private readonly configService: ConfigService) {}

  async send(to: string, message: string): Promise<SmsDeliveryResult> {
    const smsConfig = this.configService.get('sms');
    const username = smsConfig.apiKey as string;
    const password = smsConfig.melipayamakPassword as string;
    const from = smsConfig.senderLine as string;
    const baseUrl = smsConfig.melipayamakBaseUrl as string;

    if (!username || !password) {
      return { success: false, error: 'Melipayamak credentials not configured' };
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
}
