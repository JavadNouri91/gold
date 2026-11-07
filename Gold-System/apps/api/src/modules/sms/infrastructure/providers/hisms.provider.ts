import { Injectable } from '@nestjs/common';
import { lookup as resolveHost } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { URL } from 'node:url';
import { SmsDeliveryResult, SmsProvider, SmsRuntimeConfig } from './sms-provider.interface';

type ErrorModel = { errorCode?: number; message?: string | null; timestamp?: number | null };
type HismsResponse = {
  errorModel?: ErrorModel;
  references?: Array<string | number>;
  userInfo?: { credit?: number | string };
  states?: Array<{ id: string | number; state: number }>;
};

const ERROR_MESSAGES: Record<number, string> = {
  0: 'عملیات با موفقیت انجام شد.',
  [-101]: 'نام کاربری یا رمز عبور سرویس پیامک صحیح نیست.',
  [-103]: 'شماره خط ارسال‌کننده معتبر نیست.',
  [-104]: 'اعتبار پنل پیامک کافی نیست.',
  [-105]: 'درخواست سرویس پیامک معتبر نیست.',
  [-107]: 'شماره مقصد معتبر نیست.',
  [-110]: 'آدرس IP سرور در پنل پیامک ثبت نشده است.',
  [-119]: 'وب‌سرویس پیامک برای این حساب فعال نیست.',
  [-160]: 'قالب پیامک تأیید معتبر نیست.',
  [-161]: 'پارامترهای قالب پیامک معتبر نیست.',
  [-201]: 'سرویس پیامک موقتاً با خطا روبه‌رو شده است.',
};

const DELIVERY_STATES: Record<number, string> = {
  0: 'SCHEDULED',
  1: 'SENT',
  2: 'DELIVERED',
  3: 'NOT_DELIVERED',
  4: 'UNKNOWN',
  5: 'READY',
  6: 'CANCELLED',
};

@Injectable()
export class HismsProvider implements SmsProvider {
  readonly providerName = 'hisms';
  private readonly timeoutMs = 10_000;

  async send(to: string, message: string, config?: SmsRuntimeConfig): Promise<SmsDeliveryResult> {
    if (!config) return { success: false, error: 'تنظیمات سرویس پیامک کامل نیست.' };
    if (!config.originator || !message.trim())
      return { success: false, error: 'تنظیمات سرویس پیامک کامل نیست.' };
    const result = await this.call(config, 'sendMessageOneToMany', {
      username: config.username,
      password: config.password,
      originator: config.originator,
      content: message,
      destinations: [to],
    });
    return this.deliveryResult(result);
  }

  async sendOtp(
    to: string,
    code: string,
    _purpose: string,
    config?: SmsRuntimeConfig,
  ): Promise<SmsDeliveryResult> {
    if (!config?.otpTemplate) return { success: false, error: 'تنظیمات ارسال کد تأیید کامل نیست.' };
    return this.sendTemplateMessage(to, config.otpTemplate, [code], config);
  }

  async sendTemplateMessage(
    to: string,
    template: string,
    parameters: string[],
    config?: SmsRuntimeConfig,
  ): Promise<SmsDeliveryResult> {
    if (
      !config ||
      !config.enabled ||
      !template.trim() ||
      !parameters.length ||
      parameters.length > 20 ||
      parameters.some((item) => typeof item !== 'string') ||
      !config.username ||
      !config.password ||
      !config.apiBaseUrl
    )
      return { success: false, error: 'تنظیمات ارسال قالب پیامک کامل نیست.' };
    const result = await this.call(config, 'sendParameterizedMessage', {
      username: config.username,
      password: config.password,
      template,
      parameters,
      destinations: [to],
    });
    return this.deliveryResult(result);
  }

  async getUserInfo(
    config: SmsRuntimeConfig,
  ): Promise<{ success: boolean; credit?: string; error?: string; errorCode?: number }> {
    if (!this.isConfigured(config)) return { success: false, error: 'تنظیمات ناقص است.' };
    const response = await this.call(config, 'getUserInfo', {
      username: config.username,
      password: config.password,
    });
    if (!response.ok)
      return { success: false, error: response.error, errorCode: response.errorCode };
    const credit = response.body?.userInfo?.credit;
    if (credit !== undefined && credit !== null && !/^\d+(?:\.\d+)?$/.test(String(credit)))
      return { success: false, error: 'پاسخ سرویس پیامک معتبر نیست.' };
    return {
      success: true,
      ...(credit !== undefined && credit !== null ? { credit: String(credit) } : {}),
    };
  }

  async getMessageStatus(config: SmsRuntimeConfig, referenceIds: string[]) {
    if (!this.isConfigured(config)) return { success: false as const, error: 'تنظیمات ناقص است.' };
    const ids = referenceIds.map((id) => id.trim());
    if (!ids.length || ids.length > 100 || ids.some((id) => !/^\d{1,30}$/.test(id)))
      return { success: false as const, error: 'شناسه پیام معتبر نیست.' };
    // The PDF defines V2 ids as Long. Keep them as strings in the app, then emit exact JSON integers.
    const body = `{"username":${JSON.stringify(config.username)},"password":${JSON.stringify(config.password)},"ids":[${ids.join(',')}]}`;
    const response = await this.request(config, 'getMessageState', body);
    if (!response.ok)
      return { success: false as const, error: response.error, errorCode: response.errorCode };
    const states = (response.body?.states ?? []).map((item) => ({
      id: String(item.id),
      state: DELIVERY_STATES[item.state] ?? 'UNKNOWN',
    }));
    return { success: true as const, states };
  }

  private isConfigured(config: SmsRuntimeConfig): config is SmsRuntimeConfig & {
    apiBaseUrl: string;
    username: string;
    password: string;
  } {
    return Boolean(config.apiBaseUrl && config.username && config.password);
  }

  private async call(config: SmsRuntimeConfig, endpoint: string, body: Record<string, unknown>) {
    return this.request(config, endpoint, JSON.stringify(body));
  }

  private async request(config: SmsRuntimeConfig, endpoint: string, body: string) {
    if (!this.isConfigured(config))
      return { ok: false as const, error: 'تنظیمات سرویس پیامک کامل نیست.' };
    try {
      const base = new URL(config.apiBaseUrl);
      assertSafeUrl(base);
      const resolved = await resolveHost(base.hostname, { all: true, verbatim: true });
      if (!resolved.length || resolved.some((item) => !isPublicAddress(item.address)))
        return { ok: false as const, error: 'آدرس وب‌سرویس مجاز نیست.' };
      const url = endpointUrl(base, endpoint);
      const responseText = await this.postPinned(
        url,
        resolved[0].address,
        resolved[0].family,
        body,
      );
      let parsed: HismsResponse;
      try {
        parsed = parseLosslessResponse(responseText);
      } catch {
        return { ok: false as const, error: 'پاسخ سرویس پیامک معتبر نیست.' };
      }
      const errorCode = parsed.errorModel?.errorCode;
      if (typeof errorCode !== 'number')
        return { ok: false as const, error: 'پاسخ سرویس پیامک معتبر نیست.' };
      if (errorCode !== 0)
        return {
          ok: false as const,
          error: ERROR_MESSAGES[errorCode] ?? 'درخواست سرویس پیامک انجام نشد.',
          errorCode,
        };
      return { ok: true as const, body: parsed };
    } catch {
      return { ok: false as const, error: 'ارتباط با سرویس پیامک برقرار نشد.' };
    }
  }

  private postPinned(url: URL, address: string, family: number, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const lookupPinned = createPinnedLookup(address, family) as never;
      const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
      const req = request(
        url,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
          },
          timeout: this.timeoutMs,
          lookup: lookupPinned,
        },
        (res) => {
          if ((res.statusCode ?? 0) >= 300 && (res.statusCode ?? 0) < 400) {
            res.resume();
            reject(new Error('Redirect response rejected'));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 256 * 1024) req.destroy(new Error('Response too large'));
            else chunks.push(chunk);
          });
          res.on('end', () => {
            if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
              reject(new Error('Provider HTTP error'));
              return;
            }
            resolve(Buffer.concat(chunks).toString('utf8'));
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('Provider timeout')));
      req.on('error', reject);
      req.end(body);
    });
  }

  private deliveryResult(response: {
    ok: boolean;
    body?: HismsResponse;
    error?: string;
    errorCode?: number;
  }): SmsDeliveryResult {
    if (!response.ok)
      return { success: false, error: response.error, errorCode: response.errorCode };
    const references = response.body?.references ?? [];
    return {
      success: true,
      ...(references.length ? { providerReference: String(references[0]) } : {}),
    };
  }
}

function endpointUrl(base: URL, endpoint: string): URL {
  const url = new URL(base.toString());
  const root = url.pathname.replace(/\/+$/, '').replace(/\/webservice\/rest\/v2$/i, '');
  url.pathname = `${root}/webservice/rest/v2/${endpoint}`.replace(/\/+/g, '/');
  url.search = '';
  url.hash = '';
  return url;
}

function assertSafeUrl(url: URL) {
  if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production')
    throw new Error('HTTPS required');
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid provider URL');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal' ||
    hostname === 'metadata'
  )
    throw new Error('Private host rejected');
  if (isIP(hostname) && !isPublicAddress(hostname)) throw new Error('Private IP rejected');
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const parts = address.split('.').map(Number);
    const [a, b] = parts;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && (b === 0 || b === 2)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0)
    );
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith('::ffff:')) return isPublicAddress(normalized.slice(7));
    const first = parseInt(normalized.split(':')[0] || '0', 16);
    return (first & 0xe000) === 0x2000 && !normalized.startsWith('2001:db8:');
  }
  return false;
}

export function createPinnedLookup(address: string, family: number) {
  return (
    _: string,
    options: { all?: boolean },
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | Array<{ address: string; family: number }>,
      family?: number,
    ) => void,
  ) => {
    // Node 24 may set `all: true` on the lookup options. Its callback then
    // expects an address list instead of the legacy address/family tuple.
    if (options?.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

export function parseLosslessResponse(text: string): HismsResponse {
  const safe = text
    .replace(
      /("references"\s*:\s*\[)([^\]]*)(\])/g,
      (_whole, start: string, contents: string, end: string) =>
        `${start}${contents.replace(/(^|,)\s*(\d+)(?=\s*(,|$))/g, '$1"$2"')}${end}`,
    )
    .replace(/("credit"\s*:\s*)(\d+)/g, '$1"$2"')
    .replace(/("id"\s*:\s*)(\d+)/g, '$1"$2"');
  return JSON.parse(safe) as HismsResponse;
}
