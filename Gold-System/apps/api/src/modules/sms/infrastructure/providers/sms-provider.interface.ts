/**
 * SMS Provider Interface
 *
 * docs/21-business-decisions.md §10.1:
 *   "Architecture must support multiple notification providers simultaneously
 *    or switchable via configuration. Use the Adapter pattern."
 *
 * RULE: No provider-specific code in domain or application layers.
 * Only this interface is visible to NotificationService.
 */

/** Provider values accepted in the database and in SMS_PROVIDER. */
export const SMS_PROVIDER_NAMES = ['smsir', 'melipayamak', 'mock'] as const;
export type SmsProviderName = (typeof SMS_PROVIDER_NAMES)[number];

/**
 * Credentials resolved for a single send.
 *
 * Built by SmsSettingsService: values saved in the admin panel win,
 * empty fields fall back to the .env configuration.
 */
export interface SmsRuntimeConfig {
  provider: SmsProviderName;
  apiKey: string;
  senderLine: string;
  smsirBaseUrl: string;
  melipayamakBaseUrl: string;
  melipayamakPassword: string;
}

export interface SmsProvider {
  /**
   * Send an SMS message.
   *
   * @param to       Recipient phone number (including country code, e.g. +989123456789)
   * @param message  Plain-text message body (max 160 chars for single SMS)
   * @param config   Credentials for this send. Providers fall back to the env
   *                 configuration when omitted (kept for callers/tests that
   *                 inject a provider directly).
   * @returns        { success, providerReference?, error? }
   *
   * MUST NOT throw — return { success: false, error: '...' } on failure.
   */
  send(to: string, message: string, config?: SmsRuntimeConfig): Promise<SmsDeliveryResult>;

  /** Provider name — for logging and audit */
  readonly providerName: string;
}

export interface SmsDeliveryResult {
  success: boolean;
  providerReference?: string;
  error?: string;
}

export const SMS_PROVIDER_TOKEN = 'SMS_PROVIDER';
