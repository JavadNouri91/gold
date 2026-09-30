import { registerAs } from '@nestjs/config';

/**
 * SMS Provider Configuration
 *
 * docs/21-business-decisions.md §10.1:
 *   "Two providers in consideration: SMS.ir and Melipayamak.
 *    Architecture must support multiple providers simultaneously or switchable via configuration."
 *
 * open-questions.md #31: Provider final selection TBD.
 * Until resolved: use mock provider in development.
 *
 * Provider selection: SMS_PROVIDER=smsir | melipayamak | mock
 */
export default registerAs('sms', () => ({
  provider: process.env.SMS_PROVIDER ?? 'mock',
  apiKey: process.env.SMS_API_KEY ?? '',
  senderLine: process.env.SMS_SENDER_LINE ?? '',
  // SMS.ir specific
  smsirBaseUrl: process.env.SMSIR_BASE_URL ?? 'https://api.sms.ir/v1',
  // Melipayamak specific
  melipayamakBaseUrl:
    process.env.MELIPAYAMAK_BASE_URL ?? 'https://rest.payamak-panel.com/api/SendSMS',
  melipayamakPassword: process.env.MELIPAYAMAK_PASSWORD ?? '',
}));
