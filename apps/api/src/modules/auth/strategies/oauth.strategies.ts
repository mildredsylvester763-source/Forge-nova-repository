// ============================================================================
// FILE: /apps/api/src/modules/auth/strategies/oauth.strategies.ts
// ============================================================================
// Google + Facebook OAuth login (Apple deliberately excluded by product
// decision). Credentials come from environment variables — never from code.
// Production requires them (env validation); in development an unconfigured
// provider boots with a placeholder instead of crashing the whole API.

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { ConfigService } from '@nestjs/config';

export interface OAuthProfile {
  provider: 'google' | 'facebook';
  providerId: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  // TRUE only when the provider itself vouches that the user controls the
  // email. Account linking by email depends on it.
  emailVerified: boolean;
  raw: Record<string, any>;
}

const GOOGLE_SCOPES = ['openid', 'email', 'profile'];
const NOT_CONFIGURED = 'not-configured';

@Injectable()
export class GoogleOauthStrategy extends PassportStrategy(GoogleStrategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('auth.google.clientId') || NOT_CONFIGURED,
      clientSecret: configService.get<string>('auth.google.clientSecret') || NOT_CONFIGURED,
      callbackURL:
        configService.get<string>('auth.google.callbackUrl') ||
        'http://localhost:3000/api/v1/auth/google/callback',
      scope: GOOGLE_SCOPES,
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: any): OAuthProfile {
    const email: string | undefined = profile.emails?.[0]?.value;
    const verified = profile.emails?.[0]?.verified === true || profile._json?.email_verified === true;
    return {
      provider: 'google',
      providerId: profile.id,
      email,
      displayName: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value,
      emailVerified: !!email && verified,
      raw: profile._json,
    };
  }
}

@Injectable()
export class FacebookOauthStrategy extends PassportStrategy(FacebookStrategy, 'facebook') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('auth.facebook.clientId') || NOT_CONFIGURED,
      clientSecret: configService.get<string>('auth.facebook.clientSecret') || NOT_CONFIGURED,
      callbackURL:
        configService.get<string>('auth.facebook.callbackUrl') ||
        'http://localhost:3000/api/v1/auth/facebook/callback',
      profileFields: ['id', 'displayName', 'emails', 'photos'],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: any): OAuthProfile {
    return {
      provider: 'facebook',
      providerId: profile.id,
      email: profile.emails?.[0]?.value,
      displayName: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value,
      // Facebook does not verify email ownership. Treating it as verified would
      // let anyone take over an account by registering its email on Facebook.
      emailVerified: false,
      raw: profile._json,
    };
  }
}
