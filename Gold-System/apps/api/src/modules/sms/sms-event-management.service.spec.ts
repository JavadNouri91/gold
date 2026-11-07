import { SmsEventManagementService } from './application/sms-event-management.service';

describe('SmsEventManagementService', () => {
  const event = 'trading.buy_order_created' as const;
  let service: SmsEventManagementService;
  let prisma: any;
  let settings: any;
  let provider: any;
  let hisms: any;
  let audit: any;

  beforeEach(() => {
    provider = {
      send: jest.fn().mockResolvedValue({ success: true, providerReference: 'text-ref' }),
      sendTemplateMessage: jest
        .fn()
        .mockResolvedValue({ success: true, providerReference: 'ref-1' }),
    };
    hisms = {
      getMessageStatus: jest.fn().mockResolvedValue({
        success: true,
        states: [{ id: '250000000000000001', state: 'DELIVERED' }],
      }),
    };
    prisma = {
      smsEventSetting: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          enabled: true,
          recipientPolicy: 'USER',
          templateCode: 'T123',
          parameterFields: ['orderNumber'],
          customTextVerifiedAt: new Date(),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-1', mobile: '09123456789' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      smsMessageLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'log-1', providerReferenceId: '250000000000000001' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    settings = {
      resolveEffectiveConfig: jest.fn().mockResolvedValue({ enabled: true, provider: 'hisms' }),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new SmsEventManagementService(
      prisma,
      settings,
      { forProvider: () => provider } as any,
      hisms,
      audit,
    );
  });

  it('persists all registry entries disabled and reports incomplete enabled settings', async () => {
    prisma.smsEventSetting.findMany.mockResolvedValue([
      {
        eventId: event,
        enabled: true,
        recipientPolicy: 'USER',
        templateCode: null,
        parameterFields: ['orderNumber'],
      },
    ]);
    const entries = await service.list();
    expect(prisma.smsEventSetting.upsert).toHaveBeenCalled();
    expect(entries.find((item) => item.id === event)?.status).toBe('incomplete');
  });

  it('does not dispatch when the event is disabled or missing a template', async () => {
    prisma.smsEventSetting.findUnique.mockResolvedValueOnce({
      enabled: false,
      templateCode: 'T123',
    });
    await service.dispatch(event, 'order-1', 'user-1', { orderNumber: 'B1' });
    prisma.smsEventSetting.findUnique.mockResolvedValueOnce({ enabled: true, templateCode: null });
    await service.dispatch(event, 'order-2', 'user-1', { orderNumber: 'B2' });
    expect(prisma.smsMessageLog.create).not.toHaveBeenCalled();
    expect(provider.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it('resolves the selected user and sends only allow-listed parameters', async () => {
    await service.dispatch(event, 'order-1', 'user-1', {
      orderNumber: 'BUY-1',
      accountNumber: 'sensitive',
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1', status: 'ACTIVE' } }),
    );
    expect(provider.sendTemplateMessage).toHaveBeenCalledWith(
      '09123456789',
      'T123',
      ['BUY-1'],
      expect.any(Object),
    );
    expect(prisma.smsMessageLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acceptanceStatus: 'ACCEPTED',
          providerReferenceId: 'ref-1',
        }),
      }),
    );
  });

  it('renders safe custom text with allow-listed variables at dispatch time', async () => {
    prisma.smsEventSetting.findUnique.mockResolvedValue({
      enabled: true,
      recipientPolicy: 'USER',
      sendingMode: 'custom_text',
      customMessage: 'سفارش {orderNumber} ثبت شد',
      templateCode: null,
      parameterFields: [],
      customTextVerifiedAt: new Date(),
    });
    await service.dispatch(event, 'order-custom', 'user-1', { orderNumber: 'BUY-9' });
    expect(provider.send).toHaveBeenCalledWith(
      '09123456789',
      'سفارش BUY-9 ثبت شد',
      expect.any(Object),
    );
    expect(provider.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it('keeps custom-text notifications unavailable until an explicit standard-text test is accepted', async () => {
    prisma.smsEventSetting.findUnique.mockResolvedValue({
      enabled: true,
      recipientPolicy: 'USER',
      sendingMode: 'custom_text',
      customMessage: 'سفارش {orderNumber} ثبت شد',
      templateCode: null,
      parameterFields: [],
      customTextVerifiedAt: null,
    });
    await service.dispatch(event, 'order-before-test', 'user-1', { orderNumber: 'BUY-9' });
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('does not send custom text with unknown variables or missing event data', async () => {
    prisma.smsEventSetting.findUnique.mockResolvedValue({
      enabled: true,
      recipientPolicy: 'USER',
      sendingMode: 'custom_text',
      customMessage: 'سفارش {accountNumber}',
      templateCode: null,
      parameterFields: [],
      customTextVerifiedAt: new Date(),
    });
    await service.dispatch(event, 'order-unsafe', 'user-1', { accountNumber: '4111' });
    expect(provider.send).not.toHaveBeenCalled();
    prisma.smsEventSetting.findUnique.mockResolvedValueOnce({
      enabled: true,
      recipientPolicy: 'USER',
      sendingMode: 'custom_text',
      customMessage: 'سفارش {orderNumber}',
      templateCode: null,
      parameterFields: [],
      customTextVerifiedAt: new Date(),
    });
    await service.dispatch(event, 'order-missing', 'user-1', {});
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('sends test messages using the configured custom-text mode and sample values', async () => {
    prisma.smsEventSetting.findUnique.mockResolvedValue({
      enabled: true,
      recipientPolicy: 'USER',
      sendingMode: 'custom_text',
      customMessage: 'سفارش {orderNumber} ثبت شد',
      templateCode: null,
      parameterFields: [],
    });
    const result = await service.sendTest(event, '09123456789', true, 'admin-1');
    expect(result.success).toBe(true);
    expect(provider.send).toHaveBeenCalledWith(
      '09123456789',
      'سفارش BUY-TEST ثبت شد',
      expect.any(Object),
    );
    expect(prisma.smsEventSetting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customTextVerifiedAt: expect.any(Date) }),
      }),
    );
  });

  it('does not send a duplicate idempotency key after a retry', async () => {
    prisma.smsMessageLog.create.mockRejectedValue({ code: 'P2002' });
    await service.dispatch(event, 'order-1', 'user-1', { orderNumber: 'BUY-1' });
    expect(provider.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it('logs provider failures without exposing request values', async () => {
    provider.sendTemplateMessage.mockResolvedValue({ success: false, errorCode: -104 });
    await service.dispatch(event, 'order-1', 'user-1', { orderNumber: 'BUY-1' });
    expect(prisma.smsMessageLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acceptanceStatus: 'REJECTED', providerErrorCode: -104 }),
      }),
    );
  });

  it('keeps OTP mandatory even when its event row is disabled', async () => {
    prisma.smsEventSetting.findUnique.mockResolvedValue({
      enabled: false,
      templateCode: 'REG-TEMPLATE',
      parameterFields: ['code'],
    });
    const result = await service.sendMandatoryOtp('REGISTRATION', '09123456789', '654321');
    expect(result?.success).toBe(true);
    expect(provider.sendTemplateMessage).toHaveBeenCalledWith(
      '09123456789',
      'REG-TEMPLATE',
      ['654321'],
      expect.any(Object),
    );
    const loggedData = prisma.smsMessageLog.create.mock.calls[0][0].data;
    expect(JSON.stringify(loggedData)).not.toContain('654321');
  });

  it('sends a template test only after explicit confirmation and logs acceptance', async () => {
    await expect(service.sendTest(event, '09123456789', false, 'admin-1')).rejects.toThrow();
    expect(provider.sendTemplateMessage).not.toHaveBeenCalled();
    const result = await service.sendTest(event, '09123456789', true, 'admin-1');
    expect(result.success).toBe(true);
    expect(provider.sendTemplateMessage).toHaveBeenCalledWith(
      '09123456789',
      'T123',
      ['BUY-TEST'],
      expect.any(Object),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'SMS_EVENT_TEST' }));
  });

  it('resolves only active authorized administrators for the ADMIN recipient policy', async () => {
    prisma.smsEventSetting.findUnique.mockResolvedValue({
      enabled: true,
      recipientPolicy: 'ADMIN',
      templateCode: 'T123',
      parameterFields: ['orderNumber'],
    });
    prisma.user.findMany.mockResolvedValue([
      { id: 'admin-1', mobile: '09111111111' },
      { id: 'invalid', mobile: '123' },
    ]);
    await service.dispatch(event, 'order-1', null, { orderNumber: 'BUY-1' });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE', roles: expect.any(Object) } }),
    );
    expect(provider.sendTemplateMessage).toHaveBeenCalledTimes(1);
    expect(provider.sendTemplateMessage).toHaveBeenCalledWith(
      '09111111111',
      'T123',
      ['BUY-1'],
      expect.any(Object),
    );
  });

  it('validates recipient policy and approved parameter names on configuration updates', async () => {
    await expect(
      service.update(
        event,
        {
          enabled: true,
          recipientPolicy: 'USER' as any,
          templateCode: 'T1',
          parameterFields: ['accountNumber'],
        },
        'admin-1',
      ),
    ).rejects.toThrow();
    await expect(
      service.update(
        event,
        {
          enabled: true,
          recipientPolicy: 'UNSAFE' as any,
          templateCode: 'T1',
          parameterFields: ['orderNumber'],
        },
        'admin-1',
      ),
    ).rejects.toThrow();
  });

  it('persists an optional event configuration and audits only safe fields', async () => {
    prisma.smsEventSetting.upsert.mockResolvedValue({
      eventId: event,
      enabled: true,
      recipientPolicy: 'BOTH',
      templateCode: 'PRIVATE-TEMPLATE-CODE',
      parameterFields: ['orderNumber'],
    });
    await service.update(
      event,
      {
        enabled: true,
        recipientPolicy: 'BOTH',
        templateCode: 'PRIVATE-TEMPLATE-CODE',
        parameterFields: ['orderNumber'],
      },
      'admin-1',
    );
    expect(prisma.smsEventSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          enabled: true,
          recipientPolicy: 'BOTH',
          templateCode: 'PRIVATE-TEMPLATE-CODE',
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ templateConfigured: true }),
      }),
    );
    expect(JSON.stringify(audit.log.mock.calls[0][0])).not.toContain('PRIVATE-TEMPLATE-CODE');
  });

  it('persists custom text mode and rejects variables outside the event allow-list', async () => {
    prisma.smsEventSetting.upsert.mockResolvedValue({
      eventId: event,
      enabled: false,
      recipientPolicy: 'USER',
      templateCode: null,
      parameterFields: [],
      sendingMode: 'custom_text',
      customMessage: 'سفارش {orderNumber}',
      updatedAt: new Date(),
      updatedById: 'admin-1',
    });
    await service.update(
      event,
      {
        enabled: false,
        recipientPolicy: 'USER',
        templateCode: '',
        parameterFields: [],
        sendingMode: 'custom_text',
        customMessage: 'سفارش {orderNumber}',
      },
      'admin-1',
    );
    expect(prisma.smsEventSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sendingMode: 'custom_text',
          customMessage: 'سفارش {orderNumber}',
        }),
        update: expect.objectContaining({
          sendingMode: 'custom_text',
          customMessage: 'سفارش {orderNumber}',
        }),
      }),
    );
    await expect(
      service.update(
        event,
        {
          enabled: true,
          recipientPolicy: 'USER',
          templateCode: '',
          parameterFields: [],
          sendingMode: 'custom_text',
          customMessage: '{accountNumber}',
        },
        'admin-1',
      ),
    ).rejects.toThrow();
  });

  it('refreshes provider delivery states using bounded string references', async () => {
    const result = await service.refreshDeliveryStatus(event, 'admin-1');
    expect(hisms.getMessageStatus).toHaveBeenCalledWith(expect.any(Object), ['250000000000000001']);
    expect(prisma.smsMessageLog.updateMany).toHaveBeenCalledWith({
      where: { eventId: event, provider: 'hisms', providerReferenceId: '250000000000000001' },
      data: { deliveryStatus: 'DELIVERED' },
    });
    expect(result).toEqual({ success: true, checked: 1, updated: 1 });
  });
});
