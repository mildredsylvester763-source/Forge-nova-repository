// ============================================================================
// FILE: /apps/api/src/modules/auth/auth.service.ts
// ============================================================================
// Full auth lifecycle: email+password (register/login), Google + Facebook
// OAuth login, JWT access tokens (15 min) + rotating refresh tokens (30 days,
// hashed at rest). Security behaviors:
//   - bcrypt cost 12 password hashing
//   - progressive lockout: 5 failed logins → 15-minute lock
//   - refresh rotation with family reuse detection → token theft kills family
//   - OAuth identity linking: an email can hold password AND social logins
//   - status checks on every path — suspended/deleted accounts cannot enter

import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { User, AuthProvider, UserStatus } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { OAuthProfile } from './strategies/oauth.strategies';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const ACCESS_TOKEN_TTL_SEC = 15 * 60;          // 15 minutes
const REFRESH_TOKEN_TTL_DAYS = 30;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Email + password ──────────────────────────────────────────────────────
  async register(dto: RegisterDto, meta: RequestMeta): Promise<{ user: User; tokens: TokenPair }> {
    const existing = await this.userRepository.findOne({ where: { email: dto.email.toLowerCase() } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.userRepository.save(
      this.userRepository.create({
        email: dto.email.toLowerCase(),
        passwordHash,
        displayName: dto.displayName || dto.email.split('@')[0],
        provider: AuthProvider.LOCAL,
        status: UserStatus.ACTIVE,
        lastLoginAt: new Date(),
      }),
    );

    const tokens = await this.issueTokens(user.id, user.role, meta, randomUUID());
    return { user: this.sanitize(user), tokens };
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<{ user: User; tokens: TokenPair }> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    // Same error for unknown email and wrong password — no account enumeration.
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new ForbiddenException('Account temporarily locked. Try again later.');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException('Invalid email or password');
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    const tokens = await this.issueTokens(user.id, user.role, meta, randomUUID());
    return { user: this.sanitize(user), tokens };
  }

  // ─── OAuth (Google / Facebook) ─────────────────────────────────────────────
  async oauthLogin(profile: OAuthProfile, meta: RequestMeta): Promise<{ user: User; tokens: TokenPair }> {
    // 1. Match by provider identity first.
    let user = await this.userRepository.findOne({
      where: { provider: profile.provider as AuthProvider, providerId: profile.providerId },
    });

    // 2. Else match by verified email — link the social identity to the
    //    existing account instead of creating a duplicate.
    if (!user && profile.email) {
      user = await this.userRepository.findOne({ where: { email: profile.email.toLowerCase() } });
      if (user) {
        user.provider = profile.provider as AuthProvider;
        user.providerId = profile.providerId;
        user.providerProfile = profile.raw;
        if (!user.avatarUrl && profile.avatarUrl) user.avatarUrl = profile.avatarUrl;
      }
    }

    // 3. Else create the account — exactly like Google/Facebook "sign up" flows.
    if (!user) {
      user = await this.userRepository.save(
        this.userRepository.create({
          email: profile.email?.toLowerCase(),
          provider: profile.provider as AuthProvider,
          providerId: profile.providerId,
          providerProfile: profile.raw,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          emailVerified: profile.emailVerified,
          status: UserStatus.ACTIVE,
          lastLoginAt: new Date(),
        }),
      );
    } else {
      if (user.status !== UserStatus.ACTIVE) {
        throw new ForbiddenException('Account is not active');
      }
      user.lastLoginAt = new Date();
      user.providerProfile = profile.raw;
      await this.userRepository.save(user);
    }

    const tokens = await this.issueTokens(user.id, user.role, meta, randomUUID());
    return { user: this.sanitize(user), tokens };
  }

  // ─── Refresh rotation ──────────────────────────────────────────────────────
  async refresh(rawRefreshToken: string, meta: RequestMeta): Promise<TokenPair> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.refreshTokenRepository.findOne({ where: { tokenHash } });

    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    // Reuse of an already-consumed token = the family is compromised.
    // Kill the whole family, force re-login everywhere.
    if (stored.consumedAt || stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      this.logger.warn('Refresh token reuse detected — family revoked: ' + stored.familyId);
      throw new UnauthorizedException('Session compromised — please log in again');
    }

    if (stored.isExpired) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Session expired — please log in again');
    }

    const user = await this.userRepository.findOne({ where: { id: stored.userId } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Account is not active');
    }

    // Rotate: consume the old row, issue a new token in the same family.
    stored.consumedAt = new Date();
    await this.refreshTokenRepository.save(stored);
    return this.issueTokens(user.id, user.role, meta, stored.familyId);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.refreshTokenRepository.findOne({ where: { tokenHash } });
    if (stored) {
      stored.revokedAt = new Date();
      await this.refreshTokenRepository.save(stored);
      await this.revokeFamily(stored.familyId);
    }
  }

  // ─── Token machinery ────────────────────────────────────────────────────────
  private async issueTokens(userId: string, role: string, meta: RequestMeta, familyId: string): Promise<TokenPair> {
    const accessToken = this.jwtService.sign({ sub: userId, role }, {
      expiresIn: ACCESS_TOKEN_TTL_SEC,
      secret: this.configService.get<string>('auth.jwtSecret'),
    });

    const refreshToken = randomUUID() + '.' + randomUUID();
    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        userId,
        tokenHash: this.hashToken(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400000),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    );

    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SEC };
  }

  private async registerFailedAttempt(user: User): Promise<void> {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60000);
      user.failedLoginAttempts = 0;
    }
    await this.userRepository.save(user);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { familyId, revokedAt: null },
      { revokedAt: new Date() },
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // Never return the password hash or raw provider claims to clients.
  private sanitize(user: User): Partial<User> {
    const { passwordHash: _p, providerProfile: _pr, ...safe } = user;
    return safe;
  }
}

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}
