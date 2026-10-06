// ============================================================================
// FILE: /apps/api/src/modules/auth/auth.service.ts
// ============================================================================
// Full auth lifecycle: email+password (register/login), Google + Facebook
// OAuth login, JWT access tokens (15 min) + rotating refresh tokens (30 days,
// hashed at rest). Security behaviors:
//   - bcrypt cost 12 password hashing
//   - progressive lockout: 5 failed logins → 15-minute lock (atomic counter)
//   - login failures are indistinguishable (no enumeration, no timing leak,
//     and a locked account cannot be probed for the right password)
//   - refresh rotation is an atomic compare-and-set; reuse kills the family
//   - OAuth links to an existing account ONLY on a provider-verified email,
//     and wipes an unverified local password to defeat pre-registration
//   - status checks on every path — suspended/deleted accounts cannot enter

import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { User, AuthProvider, UserStatus, SafeUser } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { OAuthProfile } from './strategies/oauth.strategies';
import { isUniqueViolation } from '../../common/utils/errors.util';

const BCRYPT_COST = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const ACCESS_TOKEN_TTL_SEC = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_DAYS = 30;
const LOGIN_FAILURE_MESSAGE = 'Invalid credentials, or account temporarily locked';

// Compared against when the account does not exist, so response time does not
// reveal whether an email is registered.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('forge-nova-timing-equalizer', BCRYPT_COST);

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthResult {
  user: SafeUser;
  tokens: TokenPair;
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

  // ─── Email + password ──────────────────────────────────────────────────────────────
  async register(dto: RegisterDto, meta: RequestMeta): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    let user: User;
    try {
      user = await this.userRepository.save(
        this.userRepository.create({
          email,
          passwordHash,
          displayName: dto.displayName || email.split('@')[0],
          provider: AuthProvider.LOCAL,
          status: UserStatus.ACTIVE,
          lastLoginAt: new Date(),
        }),
      );
    } catch (error) {
      // Two simultaneous registrations: the unique index decides the winner.
      if (isUniqueViolation(error)) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }

    const tokens = await this.issueTokens(user.id, user.role, meta, randomUUID());
    return { user: this.sanitize(user), tokens };
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userRepository.findOne({ where: { email } });

    const locked = !!user?.lockedUntil && user.lockedUntil.getTime() > Date.now();
    // Always run exactly one bcrypt comparison, whatever the account state.
    const passwordOk = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (!user || !user.passwordHash || locked || !passwordOk) {
      // Only genuine wrong-password attempts on a live, unlocked account count.
      if (user && user.passwordHash && !locked && !passwordOk) {
        await this.registerFailedAttempt(user.id);
      }
      throw new UnauthorizedException(LOGIN_FAILURE_MESSAGE);
    }

    // Only someone holding the right password learns the account is blocked.
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }

    await this.userRepository.update(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    });

    const tokens = await this.issueTokens(user.id, user.role, meta, randomUUID());
    return { user: this.sanitize(user), tokens };
  }

  // ─── OAuth (Google / Facebook) ───────────────────────────────────────────────
  async oauthLogin(profile: OAuthProfile, meta: RequestMeta): Promise<AuthResult> {
    const provider = this.toAuthProvider(profile.provider);
    const email = profile.email?.trim().toLowerCase();

    // 1. Match by provider identity first.
    let user: User | null = await this.userRepository.findOne({
      where: { provider, providerId: profile.providerId },
    });

    // 2. Else link to an existing account by email — but ONLY when the provider
    //    has verified that email. An unverified claim must never reach an
    //    existing account (that is account takeover).
    if (!user && email) {
      const existing = await this.userRepository.findOne({ where: { email } });
      if (existing) {
        if (!profile.emailVerified) {
          throw new ConflictException(
            'An account with this email already exists. Sign in with your original method.',
          );
        }
        if (existing.status !== UserStatus.ACTIVE) {
          throw new ForbiddenException('Account is not active');
        }
        // Pre-registration defense: if the local account never proved it owns
        // the email, whoever set its password may be an attacker. Drop the
        // password and every session; the verified owner now controls it.
        if (!existing.emailVerified && existing.passwordHash) {
          existing.passwordHash = null;
          await this.revokeAllForUser(existing.id);
        }
        existing.provider = provider;
        existing.providerId = profile.providerId;
        existing.emailVerified = true;
        user = existing;
      }
    }

    if (user) {
      if (user.status !== UserStatus.ACTIVE) {
        throw new ForbiddenException('Account is not active');
      }
      user.lastLoginAt = new Date();
      user.providerProfile = profile.raw;
      if (!user.avatarUrl && profile.avatarUrl) user.avatarUrl = profile.avatarUrl;
      user = await this.userRepository.save(user);
    } else {
      user = await this.createOAuthUser(profile, provider, email);
    }

    const tokens = await this.issueTokens(user.id, user.role, meta, randomUUID());
    return { user: this.sanitize(user), tokens };
  }

  private async createOAuthUser(
    profile: OAuthProfile,
    provider: AuthProvider,
    email: string | undefined,
  ): Promise<User> {
    try {
      return await this.userRepository.save(
        this.userRepository.create({
          email,
          provider,
          providerId: profile.providerId,
          providerProfile: profile.raw,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          emailVerified: profile.emailVerified,
          status: UserStatus.ACTIVE,
          lastLoginAt: new Date(),
        }),
      );
    } catch (error) {
      // A concurrent callback created the same identity first.
      if (isUniqueViolation(error)) {
        const raced = await this.userRepository.findOne({
          where: { provider, providerId: profile.providerId },
        });
        if (raced) return raced;
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
  }

  // ─── Refresh rotation ────────────────────────────────────────────────────────────────
  async refresh(rawRefreshToken: string, meta: RequestMeta): Promise<TokenPair> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.refreshTokenRepository.findOne({ where: { tokenHash } });

    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    // Reuse of an already-consumed token = the family is compromised.
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

    // Rotate with an atomic compare-and-set: of two simultaneous requests
    // presenting the same token, exactly one may consume it. The loser is
    // treated as reuse. (A read-then-write here would let both succeed.)
    const consumed = await this.refreshTokenRepository.update(
      { id: stored.id, consumedAt: IsNull(), revokedAt: IsNull() },
      { consumedAt: new Date() },
    );
    if (!consumed.affected) {
      await this.revokeFamily(stored.familyId);
      this.logger.warn('Concurrent refresh with one token — family revoked: ' + stored.familyId);
      throw new UnauthorizedException('Session compromised — please log in again');
    }

    return this.issueTokens(user.id, user.role, meta, stored.familyId);
  }

  // Revokes the session family of the presented token — but only if it
  // belongs to the authenticated caller.
  async logout(userId: string, rawRefreshToken: string): Promise<void> {
    const stored = await this.refreshTokenRepository.findOne({
      where: { tokenHash: this.hashToken(rawRefreshToken) },
    });
    if (stored && stored.userId === userId) {
      await this.revokeFamily(stored.familyId);
    }
  }

  // ─── Token machinery ────────────────────────────────────────────────────────────────────
  private async issueTokens(
    userId: string,
    role: string,
    meta: RequestMeta,
    familyId: string,
  ): Promise<TokenPair> {
    const accessToken = this.jwtService.sign(
      { sub: userId, role },
      {
        expiresIn: ACCESS_TOKEN_TTL_SEC,
        secret: this.configService.getOrThrow<string>('auth.jwtSecret'),
        algorithm: 'HS256',
      },
    );

    // 384 bits from the CSPRNG; only its SHA-256 is stored.
    const refreshToken = randomBytes(48).toString('base64url');
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

  // Atomic: the increment happens in SQL, so parallel guesses cannot
  // under-count and slip past the lockout threshold.
  private async registerFailedAttempt(userId: string): Promise<void> {
    await this.userRepository.increment({ id: userId }, 'failedLoginAttempts', 1);
    const fresh = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, failedLoginAttempts: true },
    });
    if (fresh && fresh.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      await this.userRepository.update(userId, {
        lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60000),
        failedLoginAttempts: 0,
      });
    }
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toAuthProvider(provider: OAuthProfile['provider']): AuthProvider {
    return provider === 'google' ? AuthProvider.GOOGLE : AuthProvider.FACEBOOK;
  }

  // Never return the password hash, raw provider claims, or lockout state.
  private sanitize(user: User): SafeUser {
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
