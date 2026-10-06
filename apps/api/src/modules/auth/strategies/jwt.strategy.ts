// ============================================================================
// FILE: /apps/api/src/modules/auth/strategies/jwt.strategy.ts
// ============================================================================
// Validates the access token on every request and attaches the SAFE user to
// req.user — the single source of userId for every controller (zero-trust:
// controllers never read identity from the body). The password hash and
// provider claims never travel on req.user.

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SafeUser, User, UserStatus } from '../entities/user.entity';

export interface JwtPayload {
  sub: string; // user id
  role: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('auth.jwtSecret'),
      // Pin the algorithm: never let the token header choose it.
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<SafeUser> {
    const user = await this.userRepository.findOne({
      where: { id: payload.sub, status: UserStatus.ACTIVE },
    });
    if (!user) throw new UnauthorizedException('Account is not active');

    // Tokens issued before the last password change are dead.
    if (user.passwordChangedAt && (payload.iat ?? 0) * 1000 < user.passwordChangedAt.getTime()) {
      throw new UnauthorizedException('Token predates a password change');
    }

    const {
      passwordHash: _passwordHash,
      providerProfile: _providerProfile,
      failedLoginAttempts: _failedLoginAttempts,
      lockedUntil: _lockedUntil,
      ...safe
    } = user;
    return safe;
  }
}
