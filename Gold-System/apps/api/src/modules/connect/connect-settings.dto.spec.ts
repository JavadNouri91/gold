import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateConnectSettingsDto } from './application/dto/update-connect-settings.dto';

describe('UpdateConnectSettingsDto', () => {
  it('does not allow the external execution feature gate to be activated by API input', async () => {
    const dto = plainToInstance(UpdateConnectSettingsDto, {
      externalExecutionFeatureGate: true,
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.some((error) => error.property === 'externalExecutionFeatureGate')).toBe(true);
  });
});
