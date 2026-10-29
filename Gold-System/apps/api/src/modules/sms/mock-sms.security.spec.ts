import { Logger } from '@nestjs/common';
import { MockSmsProvider } from './infrastructure/providers/mock-sms.provider';

describe('MockSmsProvider', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  it('does not log the message body when NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production';
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const provider = new MockSmsProvider();

    await provider.send('09120000000', 'کد تایید شما: 123456');

    expect(warn).not.toHaveBeenCalled();
  });
});
