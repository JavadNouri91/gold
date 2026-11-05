import { of, firstValueFrom } from 'rxjs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { authCsrf } from './presentation/auth-csrf';
import { AuthCookieInterceptor, readRefreshCookie } from './presentation/auth-cookie.interceptor';
import { normalizeMobile } from './domain/mobile';
import { RegistrationDto, CustomerOtpDto } from './application/dto/customer-auth.dto';
import { ApprovedKycGuard } from '../../common/guards/approved-kyc.guard';
import { CustomersController } from '../customers/presentation/controllers/customers.controller';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';

describe('Authentication HTTP boundaries', () => {
  it('requires staff permission on the legacy creation route so it cannot bypass SMS verification', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, CustomersController.prototype.register)).not.toBe(
      true,
    );
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CustomersController.prototype.register)).toEqual([
      'customer.group.assign',
    ]);
  });
  it.each(['۰۹۱۲۳۴۵۶۷۸۹', '٠٩١٢٣٤٥٦٧٨٩', '+989123456789', '00989123456789', '98 912 345 6789'])(
    'normalizes %s',
    (value) => {
      expect(normalizeMobile(value)).toBe('09123456789');
    },
  );
  it('validates Iranian mobiles and six-digit codes without altering passwords', async () => {
    const dto = plainToInstance(RegistrationDto, {
      firstName: 'First',
      lastName: 'Last',
      mobile: '+989123456789',
      password: 'Exact ۱۲۳ password',
      confirmPassword: 'Exact ۱۲۳ password',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.password).toBe('Exact ۱۲۳ password');
    expect(
      (await validate(plainToInstance(CustomerOtpDto, { mobile: '123', otp: '123456' }))).length,
    ).toBeGreaterThan(0);
    expect(
      (await validate(plainToInstance(CustomerOtpDto, { mobile: dto.mobile, otp: '12345' })))
        .length,
    ).toBeGreaterThan(0);
  });
  it('requires a custom header and rejects foreign origins, including login CSRF', () => {
    const middleware = authCsrf(['https://example.com']);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    const req = { path: '/api/v1/auth/refresh', method: 'POST', headers: {} };
    middleware(req as never, res as never, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    middleware(
      { ...req, headers: { 'x-auth-request': '1', origin: 'https://evil.example' } } as never,
      res as never,
      next,
    );
    expect(next).not.toHaveBeenCalled();
    middleware(
      { ...req, headers: { 'x-auth-request': '1', origin: 'https://example.com' } } as never,
      res as never,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
  it('sets an HttpOnly cookie and removes refresh secrets from JSON', async () => {
    const response = { cookie: jest.fn() };
    const context = { switchToHttp: () => ({ getResponse: () => response }) };
    const result = await firstValueFrom(
      new AuthCookieInterceptor().intercept(context as never, {
        handle: () => of({ accessToken: 'access', refreshToken: 'secret' }),
      }),
    );
    expect(result).toEqual({ accessToken: 'access' });
    expect(response.cookie).toHaveBeenCalledWith(
      'gold_refresh',
      'secret',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api/v1/auth' }),
    );
    expect(readRefreshCookie({ headers: { cookie: 'gold_refresh=%broken' } } as never)).toBe('');
  });
});

describe('Financial KYC boundary', () => {
  const customer = { findUnique: jest.fn() };
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new ApprovedKycGuard(reflector as never, { customer } as never);
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'u1' } }) }),
  };
  beforeEach(() => {
    jest.resetAllMocks();
    reflector.getAllAndOverride.mockReturnValue(true);
  });
  it.each(['PENDING', 'UNDER_REVIEW', 'REJECTED', 'SUSPENDED', 'BLOCKED'])(
    'blocks %s financial mutations',
    async (status) => {
      customer.findUnique.mockResolvedValue({
        status,
        accountStatus: 'INACTIVE',
        kycVerifications: [],
      });
      await expect(guard.canActivate(context as never)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'KYC_REQUIRED' }),
      });
    },
  );
  it('allows approved and activated customers', async () => {
    customer.findUnique.mockResolvedValue({ status: 'ACTIVE', accountStatus: 'ACTIVE' });
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });
  it('does not block dashboard, profile, documents, or other permitted read-only endpoints', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(customer.findUnique).not.toHaveBeenCalled();
  });
});
