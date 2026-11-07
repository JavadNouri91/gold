import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { SmsProviderFactory } from '../infrastructure/providers/sms-provider.factory';
import { HismsProvider } from '../infrastructure/providers/hisms.provider';
import { SmsSettingsService } from './sms-settings.service';

export type SmsEventRecipientPolicy = 'USER' | 'ADMIN' | 'BOTH';
export type SmsEventId =
  | 'auth.registration_otp'
  | 'auth.login_otp'
  | 'auth.new_login_alert'
  | 'account.kyc_status_changed'
  | 'account.bank_account_changed'
  | 'trading.buy_order_created'
  | 'trading.sell_order_created'
  | 'trading.order_completed'
  | 'trading.order_canceled_rejected'
  | 'financial.deposit_confirmed'
  | 'financial.withdrawal_requested'
  | 'financial.withdrawal_completed';

type RegistryEntry = {
  id: SmsEventId;
  category: string;
  name: string;
  description: string;
  allowedFields: string[];
  sample: Record<string, string>;
  mandatory?: boolean;
};

/** Stable, explicit event IDs and an allow-list of safe template parameters. */
export const SMS_EVENT_REGISTRY: RegistryEntry[] = [
  {
    id: 'auth.registration_otp',
    category: 'احراز هویت',
    name: 'کد ثبت‌نام',
    description: 'OTP اجباری تأیید شماره هنگام ثبت‌نام',
    allowedFields: ['code'],
    sample: { code: '123456' },
    mandatory: true,
  },
  {
    id: 'auth.login_otp',
    category: 'احراز هویت',
    name: 'کد ورود و بازیابی',
    description: 'OTP اجباری ورود پیامکی و بازیابی رمز',
    allowedFields: ['code'],
    sample: { code: '123456' },
    mandatory: true,
  },
  {
    id: 'auth.new_login_alert',
    category: 'احراز هویت',
    name: 'هشدار ورود جدید',
    description: 'پس از ورود موفق مشتری',
    allowedFields: ['eventDate'],
    sample: { eventDate: '۱۴۰۵/۰۸/۱۷' },
  },
  {
    id: 'account.kyc_status_changed',
    category: 'حساب کاربری',
    name: 'تغییر وضعیت احراز هویت',
    description: 'پس از تأیید یا رد احراز هویت',
    allowedFields: ['status', 'eventDate'],
    sample: { status: 'تأیید شد', eventDate: '۱۴۰۵/۰۸/۱۷' },
  },
  {
    id: 'account.bank_account_changed',
    category: 'حساب کاربری',
    name: 'تغییر حساب بانکی',
    description: 'پس از ثبت، تأیید، رد یا حذف حساب بانکی',
    allowedFields: ['action', 'eventDate'],
    sample: { action: 'ثبت شد', eventDate: '۱۴۰۵/۰۸/۱۷' },
  },
  {
    id: 'trading.buy_order_created',
    category: 'معاملات',
    name: 'ثبت سفارش خرید',
    description: 'پس از ثبت نهایی سفارش خرید',
    allowedFields: ['orderNumber', 'eventDate'],
    sample: { orderNumber: 'BUY-TEST', eventDate: '۱۴۰۵/۰۸/۱۷' },
  },
  {
    id: 'trading.sell_order_created',
    category: 'معاملات',
    name: 'ثبت سفارش فروش',
    description: 'پس از ثبت نهایی سفارش فروش',
    allowedFields: ['orderNumber', 'eventDate'],
    sample: { orderNumber: 'SELL-TEST', eventDate: '۱۴۰۵/۰۸/۱۷' },
  },
  {
    id: 'trading.order_completed',
    category: 'معاملات',
    name: 'تکمیل معامله',
    description: 'پس از تأیید نهایی معامله',
    allowedFields: ['tradeNumber', 'eventDate'],
    sample: { tradeNumber: 'TRD-TEST', eventDate: '۱۴۰۵/۰۸/۱۷' },
  },
  {
    id: 'trading.order_canceled_rejected',
    category: 'معاملات',
    name: 'لغو یا رد سفارش',
    description: 'پس از لغو یا رد نهایی سفارش',
    allowedFields: ['orderNumber', 'status', 'eventDate'],
    sample: { orderNumber: 'ORD-TEST', status: 'لغو شد', eventDate: '۱۴۰۵/۰۸/۱۷' },
  },
  {
    id: 'financial.deposit_confirmed',
    category: 'مالی',
    name: 'تأیید واریز',
    description: 'پس از تأیید واریز و ثبت اعتبار',
    allowedFields: ['eventDate'],
    sample: { eventDate: '۱۴۰۵/۰۸/۱۷' },
  },
  {
    id: 'financial.withdrawal_requested',
    category: 'مالی',
    name: 'ثبت درخواست برداشت',
    description: 'پس از ثبت درخواست برداشت',
    allowedFields: ['eventDate'],
    sample: { eventDate: '۱۴۰۵/۰۸/۱۷' },
  },
  {
    id: 'financial.withdrawal_completed',
    category: 'مالی',
    name: 'تکمیل برداشت',
    description: 'پس از تأیید برداشت',
    allowedFields: ['eventDate'],
    sample: { eventDate: '۱۴۰۵/۰۸/۱۷' },
  },
];

const RECIPIENT_POLICIES: SmsEventRecipientPolicy[] = ['USER', 'ADMIN', 'BOTH'];

@Injectable()
export class SmsEventManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SmsSettingsService,
    private readonly providers: SmsProviderFactory,
    private readonly hisms: HismsProvider,
    private readonly audit: AuditService,
  ) {}

  async list() {
    await Promise.all(
      SMS_EVENT_REGISTRY.map((event) =>
        this.prisma.smsEventSetting.upsert({
          where: { eventId: event.id },
          create: {
            eventId: event.id,
            enabled: Boolean(event.mandatory),
            recipientPolicy: 'USER',
            parameterFields: event.mandatory ? event.allowedFields : [],
          },
          update: {},
        }),
      ),
    );
    const rows = await this.prisma.smsEventSetting.findMany();
    const rowMap = new Map(rows.map((row) => [row.eventId, row]));
    const effectiveConfig = await this.settings.resolveEffectiveConfig();
    const providerReady = Boolean(
      effectiveConfig.enabled &&
      effectiveConfig.provider === 'hisms' &&
      effectiveConfig.apiBaseUrl &&
      effectiveConfig.username &&
      effectiveConfig.password,
    );
    return SMS_EVENT_REGISTRY.map((event) => {
      const row:
        | (typeof rows)[number]
        | {
            eventId: string;
            enabled: boolean;
            recipientPolicy: string;
            templateCode: string | null;
            parameterFields: unknown;
            sendingMode: string;
            customMessage: string | null;
            customTextVerifiedAt: Date | null;
            updatedAt: Date;
            updatedById: string | null;
          } = rowMap.get(event.id) ?? {
        eventId: event.id,
        enabled: Boolean(event.mandatory),
        recipientPolicy: 'USER',
        templateCode: null,
        parameterFields: event.mandatory ? event.allowedFields : [],
        sendingMode: 'provider_template',
        customMessage: null,
        customTextVerifiedAt: null,
        updatedAt: new Date(),
        updatedById: null,
      };
      const fields = this.readFields(row.parameterFields, event.allowedFields);
      const runtime = this.getRuntimeFields(row.recipientPolicy, fields);
      const effectiveTemplate =
        row.templateCode?.trim() || (event.mandatory ? effectiveConfig.otpTemplate : '');
      const sendingMode = row.sendingMode ?? 'provider_template';
      const customMessage = row.customMessage ?? null;
      const status = event.mandatory
        ? providerReady && effectiveTemplate
          ? 'enabled'
          : 'incomplete'
        : !row.enabled
          ? 'disabled'
          : !providerReady ||
              runtime.length === 0 ||
              (sendingMode === 'provider_template' && !effectiveTemplate) ||
              (sendingMode === 'custom_text' &&
                (!customMessage?.trim() ||
                  !row.customTextVerifiedAt ||
                  !this.validateMessage(event, customMessage, false)))
            ? 'incomplete'
            : 'enabled';
      return {
        ...event,
        ...row,
        enabled: event.mandatory ? true : row.enabled,
        templateCode: row.templateCode,
        parameterFields: fields,
        sendingMode,
        customMessage,
        customTextVerified: Boolean(row.customTextVerifiedAt),
        providerReady,
        status,
      };
    });
  }

  async update(
    eventId: string,
    input: {
      enabled: boolean;
      recipientPolicy: SmsEventRecipientPolicy;
      templateCode: string;
      parameterFields: string[];
      sendingMode?: 'provider_template' | 'custom_text';
      customMessage?: string;
    },
    actorId: string,
    ipAddress?: string,
  ) {
    const event = this.findEvent(eventId);
    if (!RECIPIENT_POLICIES.includes(input.recipientPolicy))
      throw new BadRequestException('سیاست گیرندگان پیامک معتبر نیست.');
    if (
      !event.mandatory &&
      (!Array.isArray(input.parameterFields) ||
        input.parameterFields.some((field) => !event.allowedFields.includes(field)) ||
        new Set(input.parameterFields).size !== input.parameterFields.length)
    ) {
      throw new BadRequestException('فیلدهای پارامتر قالب معتبر نیستند.');
    }
    const templateCode = input.templateCode.trim();
    if (templateCode.length > 100) throw new BadRequestException('کد قالب پیامک معتبر نیست.');
    const sendingMode = input.sendingMode ?? 'provider_template';
    const customMessage = (input.customMessage ?? '').trim();
    if (customMessage.length > 1000) throw new BadRequestException('متن پیامک بیش از حد مجاز است.');
    if (!event.mandatory && sendingMode === 'custom_text' && customMessage) {
      const invalid = this.validateMessage(event, customMessage, true);
      if (invalid) throw new BadRequestException(invalid);
    }
    const before = await this.prisma.smsEventSetting.findUnique({ where: { eventId } });
    const after = await this.prisma.smsEventSetting.upsert({
      where: { eventId },
      create: {
        eventId,
        enabled: event.mandatory || input.enabled,
        recipientPolicy: event.mandatory ? 'USER' : input.recipientPolicy,
        templateCode: templateCode || null,
        parameterFields: event.mandatory ? event.allowedFields : input.parameterFields,
        sendingMode: event.mandatory ? 'provider_template' : sendingMode,
        customMessage: event.mandatory ? null : customMessage || null,
        updatedById: actorId,
      },
      update: {
        enabled: event.mandatory || input.enabled,
        recipientPolicy: event.mandatory ? 'USER' : input.recipientPolicy,
        templateCode: templateCode || null,
        parameterFields: event.mandatory ? event.allowedFields : input.parameterFields,
        sendingMode: event.mandatory ? 'provider_template' : sendingMode,
        customMessage: event.mandatory ? null : customMessage || null,
        updatedById: actorId,
      },
    });
    await this.audit.log({
      actorId,
      action: 'SMS_EVENT_SETTINGS_CHANGED',
      entityType: 'SmsEventSetting',
      entityId: eventId,
      ipAddress,
      before: before
        ? {
            enabled: before.enabled,
            recipientPolicy: before.recipientPolicy,
            templateConfigured: Boolean(before.templateCode),
            parameterFields: before.parameterFields,
            sendingMode: before.sendingMode ?? 'provider_template',
          }
        : null,
      after: {
        enabled: after.enabled,
        recipientPolicy: after.recipientPolicy,
        templateConfigured: Boolean(after.templateCode),
        parameterFields: after.parameterFields,
        sendingMode: after.sendingMode,
      },
    });
    return (await this.list()).find((entry) => entry.id === event.id);
  }

  /** Called only after the business transition's database transaction has committed. */
  async dispatch(
    eventId: SmsEventId,
    eventKey: string,
    userId: string | null,
    values: Record<string, string>,
  ) {
    try {
      const event = this.findEvent(eventId);
      if (event.mandatory) return;
      const setting = await this.prisma.smsEventSetting.findUnique({ where: { eventId } });
      if (!setting?.enabled) return;
      const configuredFields = this.readFields(setting.parameterFields, event.allowedFields);
      const mode: 'provider_template' | 'custom_text' =
        setting.sendingMode === 'custom_text' ? 'custom_text' : 'provider_template';
      const template = setting.templateCode?.trim();
      const customMessage = setting.customMessage?.trim();
      if (mode === 'provider_template' && (!template || !configuredFields.length)) return;
      if (
        mode === 'custom_text' &&
        (!customMessage ||
          !setting.customTextVerifiedAt ||
          this.validateMessage(event, customMessage, false))
      )
        return;
      const recipients = await this.resolveRecipients(setting.recipientPolicy, userId);
      for (const recipient of recipients) {
        const key = createHash('sha256')
          .update(`${eventId}:${eventKey}:${recipient.userId}`)
          .digest('hex');
        await this.deliverOnce(
          eventId,
          key,
          recipient.mobile,
          template ?? '',
          configuredFields,
          values,
          mode,
          customMessage ?? '',
        );
      }
    } catch {
      // Notification failures must never roll back or fail a business action.
    }
  }

  /** Mandatory OTP delivery stays independent of optional notification toggles. */
  async sendMandatoryOtp(purpose: string, mobile: string, code: string) {
    const eventId: SmsEventId | null =
      purpose === 'REGISTRATION'
        ? 'auth.registration_otp'
        : ['LOGIN', 'CUSTOMER_LOGIN', 'PASSWORD_RESET'].includes(purpose)
          ? 'auth.login_otp'
          : null;
    if (!eventId) return null;
    const row = await this.prisma.smsEventSetting.findUnique({ where: { eventId } });
    const config = await this.settings.resolveEffectiveConfig();
    if (config.provider !== 'hisms') return null;
    const template = row?.templateCode?.trim() || config.otpTemplate;
    let result: {
      success: boolean;
      providerReference?: string;
      error?: string;
      errorCode?: number;
    };
    try {
      if (!config.enabled) result = { success: false };
      else {
        const provider = this.providers.forProvider('hisms');
        result =
          template && provider.sendTemplateMessage
            ? await provider.sendTemplateMessage(mobile, template, [code], config)
            : ((await provider.sendOtp?.(mobile, code, purpose, config)) ?? { success: false });
      }
    } catch {
      result = { success: false };
    }
    try {
      await this.prisma.smsMessageLog.create({
        data: {
          provider: 'hisms',
          purpose,
          eventId,
          recipientMasked: maskMobile(mobile),
          templateCode: template || null,
          providerReferenceId: result.providerReference ?? null,
          providerErrorCode: result.errorCode ?? null,
          acceptanceStatus: result.success ? 'ACCEPTED' : 'REJECTED',
          deliveryStatus: null,
          idempotencyKey: createHash('sha256')
            .update(`otp:${eventId}:${randomUUID()}`)
            .digest('hex'),
        },
      });
    } catch {
      /* SMS result is not retried because audit persistence failed. */
    }
    return result;
  }

  async sendTest(
    eventId: string,
    mobile: string,
    confirmed: boolean,
    actorId: string,
    ipAddress?: string,
    override?: {
      sendingMode?: 'provider_template' | 'custom_text';
      templateCode?: string;
      parameterFields?: string[];
      customMessage?: string;
    },
  ) {
    if (!confirmed) throw new BadRequestException('برای ارسال آزمایشی تأیید صریح لازم است.');
    if (!/^09\d{9}$/.test(mobile)) throw new BadRequestException('شماره موبایل معتبر نیست.');
    const event = this.findEvent(eventId);
    const setting = await this.prisma.smsEventSetting.findUnique({ where: { eventId } });
    const config = await this.settings.resolveEffectiveConfig();
    const mode: 'provider_template' | 'custom_text' = event.mandatory
      ? 'provider_template'
      : (override?.sendingMode ??
        (setting?.sendingMode === 'custom_text' ? 'custom_text' : 'provider_template'));
    const template =
      (override?.templateCode ?? setting?.templateCode)?.trim() ||
      (event.mandatory ? config.otpTemplate : '');
    const customMessage = (override?.customMessage ?? setting?.customMessage ?? '').trim();
    if ((mode === 'provider_template' && !template) || (mode === 'custom_text' && !customMessage))
      throw new BadRequestException('رویداد یا قالب پیامک پیکربندی نشده است.');
    const fields = this.readFields(
      override?.parameterFields ??
        setting?.parameterFields ??
        (event.mandatory ? event.allowedFields : []),
      event.allowedFields,
    );
    if (override?.parameterFields && fields.length !== override.parameterFields.length)
      throw new BadRequestException('پارامترهای قالب پیامک معتبر نیستند.');
    if (mode === 'provider_template' && !fields.length)
      throw new BadRequestException('برای قالب پیامک پارامتری انتخاب نشده است.');
    if (!config.enabled || config.provider !== 'hisms')
      throw new BadRequestException('سرویس HiSMS فعال و پیکربندی نشده است.');
    const provider = this.providers.forProvider('hisms');
    if (mode === 'provider_template' && !provider.sendTemplateMessage)
      throw new BadRequestException('ارسال قالب پیامک در دسترس نیست.');
    let result: {
      success: boolean;
      providerReference?: string;
      error?: string;
      errorCode?: number;
    };
    try {
      if (mode === 'provider_template') {
        result = await provider.sendTemplateMessage!(
          mobile,
          template!,
          fields.map((field) => this.requiredValue(event.sample, field)),
          config,
        );
      } else {
        const rendered = this.renderMessage(event, customMessage, event.sample);
        result = await provider.send(mobile, rendered, config);
      }
    } catch {
      result = { success: false };
    }
    await this.prisma.smsMessageLog.create({
      data: {
        provider: 'hisms',
        purpose: `event_test:${eventId}`,
        recipientMasked: maskMobile(mobile),
        eventId,
        templateCode: mode === 'provider_template' ? template : null,
        providerReferenceId: result.providerReference ?? null,
        providerErrorCode: result.errorCode ?? null,
        acceptanceStatus: result.success ? 'ACCEPTED' : 'REJECTED',
        deliveryStatus: null,
        idempotencyKey: createHash('sha256').update(`test:${randomUUID()}`).digest('hex'),
      },
    });
    if (mode === 'custom_text' && result.success) {
      try {
        await this.prisma.smsEventSetting.update({
          where: { eventId },
          data: { customTextVerifiedAt: new Date() },
        });
      } catch {
        // Keep the provider acceptance result accurate; missing verification remains fail-closed.
      }
    }
    await this.audit.log({
      actorId,
      action: 'SMS_EVENT_TEST',
      entityType: 'SmsEventSetting',
      entityId: eventId,
      ipAddress,
      after: {
        success: result.success,
        mobileMasked: maskMobile(mobile),
        providerReference: result.providerReference ?? null,
        providerErrorCode: result.errorCode ?? null,
      },
    });
    return {
      success: result.success,
      providerReference: result.providerReference,
      error: result.error,
    };
  }

  async refreshDeliveryStatus(eventId: string, actorId: string, ipAddress?: string) {
    this.findEvent(eventId);
    const config = await this.settings.resolveEffectiveConfig();
    if (!config.enabled || config.provider !== 'hisms') {
      throw new BadRequestException('سرویس HiSMS فعال و پیکربندی نشده است.');
    }
    const rows = await this.prisma.smsMessageLog.findMany({
      where: {
        eventId,
        provider: 'hisms',
        acceptanceStatus: 'ACCEPTED',
        providerReferenceId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, providerReferenceId: true },
    });
    const references = [
      ...new Set(
        rows.map((row) => row.providerReferenceId).filter((id): id is string => Boolean(id)),
      ),
    ];
    if (!references.length) return { success: true, checked: 0, updated: 0 };
    const status = await this.hisms.getMessageStatus(config, references);
    if (!status.success) {
      await this.audit.log({
        actorId,
        action: 'SMS_EVENT_DELIVERY_STATUS_REFRESHED',
        entityType: 'SmsEventSetting',
        entityId: eventId,
        ipAddress,
        after: {
          success: false,
          checked: references.length,
          updated: 0,
          providerErrorCode: status.errorCode ?? null,
        },
      });
      return { success: false, checked: references.length, updated: 0, error: status.error };
    }
    let updated = 0;
    for (const item of status.states) {
      const result = await this.prisma.smsMessageLog.updateMany({
        where: { eventId, provider: 'hisms', providerReferenceId: item.id },
        data: { deliveryStatus: item.state },
      });
      updated += result.count;
    }
    await this.audit.log({
      actorId,
      action: 'SMS_EVENT_DELIVERY_STATUS_REFRESHED',
      entityType: 'SmsEventSetting',
      entityId: eventId,
      ipAddress,
      after: { checked: references.length, updated },
    });
    return { success: true, checked: references.length, updated };
  }

  private async deliverOnce(
    eventId: string,
    idempotencyKey: string,
    mobile: string,
    template: string,
    fields: string[],
    values: Record<string, string>,
    mode: 'provider_template' | 'custom_text' = 'provider_template',
    customMessage = '',
  ) {
    let logId: string;
    try {
      const row = await this.prisma.smsMessageLog.create({
        data: {
          provider: 'hisms',
          purpose: eventId,
          eventId,
          recipientMasked: maskMobile(mobile),
          templateCode: mode === 'provider_template' ? template : null,
          acceptanceStatus: 'PROCESSING',
          idempotencyKey,
        },
      });
      logId = row.id;
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') return;
      throw error;
    }
    let result: {
      success: boolean;
      providerReference?: string;
      error?: string;
      errorCode?: number;
    };
    try {
      const config = await this.settings.resolveEffectiveConfig();
      if (!config.enabled || config.provider !== 'hisms') throw new Error('Provider unavailable');
      const provider = this.providers.forProvider('hisms');
      if (mode === 'provider_template') {
        if (!provider.sendTemplateMessage) throw new Error('Template sending unavailable');
        const parameters = fields.map((field) => this.requiredValue(values, field));
        result = await provider.sendTemplateMessage(mobile, template, parameters, config);
      } else {
        const message = this.renderMessage(this.findEvent(eventId), customMessage, values);
        result = await provider.send(mobile, message, config);
      }
    } catch {
      result = { success: false };
    }
    await this.prisma.smsMessageLog.update({
      where: { id: logId },
      data: {
        acceptanceStatus: result.success ? 'ACCEPTED' : 'REJECTED',
        providerReferenceId: result.providerReference ?? null,
        providerErrorCode: result.errorCode ?? null,
      },
    });
  }

  private async resolveRecipients(policy: string, userId: string | null) {
    const recipients: Array<{ userId: string; mobile: string }> = [];
    if ((policy === 'USER' || policy === 'BOTH') && userId) {
      const user = await this.prisma.user.findFirst({
        where: { id: userId, status: 'ACTIVE' },
        select: { id: true, mobile: true },
      });
      if (user && /^09\d{9}$/.test(user.mobile))
        recipients.push({ userId: user.id, mobile: user.mobile });
    }
    if (policy === 'ADMIN' || policy === 'BOTH') {
      const admins = await this.prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          roles: {
            some: {
              role: { permissions: { some: { permission: { key: 'sms.settings.manage' } } } },
            },
          },
        },
        select: { id: true, mobile: true },
      });
      for (const admin of admins)
        if (/^09\d{9}$/.test(admin.mobile) && !recipients.some((row) => row.userId === admin.id))
          recipients.push({ userId: admin.id, mobile: admin.mobile });
    }
    return recipients;
  }

  private findEvent(eventId: string) {
    const event = SMS_EVENT_REGISTRY.find((item) => item.id === eventId);
    if (!event) throw new BadRequestException('شناسه رویداد پیامکی پشتیبانی نمی‌شود.');
    return event;
  }

  private readFields(value: unknown, allowed: string[]) {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (field): field is string => typeof field === 'string' && allowed.includes(field),
    );
  }

  private validateMessage(
    event: RegistryEntry,
    template: string,
    returnError: boolean,
  ): string | null {
    if (!template.trim()) return returnError ? 'متن پیامک خالی است.' : 'empty';
    const tokens = [...template.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
    const malformed = template.replace(/\{[^{}]+\}/g, '').match(/[{}]/);
    const unknown = tokens.find((token) => !event.allowedFields.includes(token));
    if (malformed || unknown)
      return returnError ? `متغیر پیامک مجاز نیست: ${unknown ?? 'قالب نامعتبر'}.` : 'invalid';
    return null;
  }

  private renderMessage(event: RegistryEntry, template: string, values: Record<string, string>) {
    const invalid = this.validateMessage(event, template, true);
    if (invalid) throw new Error(invalid);
    return template.replace(/\{([^{}]+)\}/g, (_token, key: string) =>
      this.requiredValue(values, key),
    );
  }

  private requiredValue(values: Record<string, string>, key: string) {
    const value = values[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing SMS variable: ${key}`);
    return value;
  }

  private getRuntimeFields(policy: string, fields: string[]) {
    return RECIPIENT_POLICIES.includes(policy as SmsEventRecipientPolicy) ? fields : [];
  }
}

function maskMobile(value: string) {
  return value.length === 11 ? `${value.slice(0, 3)}***${value.slice(-2)}` : '***';
}
