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
export interface SmsProvider {
  /**
   * Send an SMS message.
   *
   * @param to       Recipient phone number (including country code, e.g. +989123456789)
   * @param message  Plain-text message body (max 160 chars for single SMS)
   * @returns        { success, providerReference?, error? }
   *
   * MUST NOT throw — return { success: false, error: '...' } on failure.
   */
  send(to: string, message: string): Promise<SmsDeliveryResult>;

  /** Provider name — for logging and audit */
  readonly providerName: string;
}

export interface SmsDeliveryResult {
  success: boolean;
  providerReference?: string;
  error?: string;
}

export const SMS_PROVIDER_TOKEN = 'SMS_PROVIDER';
