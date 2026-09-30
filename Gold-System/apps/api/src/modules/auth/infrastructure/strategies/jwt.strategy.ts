import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '@gold/shared-types';
import { CurrentUserData } from '../../../../common/decorators/current-user.decorator';
import { SessionEnforcementService } from '../../../sessions/application/session-enforcement.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly sessions: SessionEnforcementService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<CurrentUserData> {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token');
    }

    if (payload.sid) {
      await this.sessions.assertActive(payload.sid, payload.sub);
    }

    return {
      userId: payload.sub,
      sub: payload.sub,
      mobile: payload.mobile,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
      sessionId: payload.sid ?? null,
    };
  }
}
