// ============================================================================
// FILE: /apps/api/src/modules/auth/strategies/jwt.strategy.ts
// ============================================================================
// Validates the access token on every request and attaches the user to
// req.user — the single source of userId for every controller (zero-trust:
// controllers never read identity from the body).

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../entities/user.entity';

export interface JwtPayload {
  sub: string;           // user id
  role: string;
  iat: number;
  exp: number;
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
      secretOrKey: configService.get<string>('auth.jwtSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: payload.sub, status: UserStatus.ACTIVE },
    });
    if (!user) throw new UnauthorizedException('Account is not active');
    return user;
  }
}
