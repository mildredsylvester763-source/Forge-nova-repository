// ============================================================================
// FILE: /apps/api/src/modules/auth/strategies/oauth.strategies.ts
// ============================================================================
// Google + Facebook OAuth login (Apple deliberately excluded by product
// decision). Credentials come from environment variables — never from code.

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
  emailVerified: boolean;
  raw: Record<string, any>;
}

const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

@Injectable()
export class GoogleOauthStrategy extends PassportStrategy(GoogleStrategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('auth.google.clientId') || '',
      clientSecret: configService.get<string>('auth.google.clientSecret') || '',
      callbackURL: configService.get<string>('auth.google.callbackUrl') || '',
      scope: GOOGLE_SCOPES,
    });
  }

  validate(accessToken: string, _refresh: string, profile: any): OAuthProfile {
    return {
      provider: 'google',
      providerId: profile.id,
      email: profile.emails?.[0]?.value,
      displayName: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value,
      emailVerified: !!(profile.emails?.[0]?.value && profile.emails?.[0]?.verified),
      raw: profile._json,
    };
  }
}

@Injectable()
export class FacebookOauthStrategy extends PassportStrategy(FacebookStrategy, 'facebook') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('auth.facebook.clientId') || '',
      clientSecret: configService.get<string>('auth.facebook.clientSecret') || '',
      callbackURL: configService.get<string>('auth.facebook.callbackUrl') || '',
      profileFields: ['id', 'displayName', 'emails', 'photos'],
    });
  }

  validate(accessToken: string, _refresh: string, profile: any): OAuthProfile {
    return {
      provider: 'facebook',
      providerId: profile.id,
      email: profile.emails?.[0]?.value,
      displayName: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value,
      // Facebook does not reliably report email verification.
      emailVerified: !!profile.emails?.[0]?.value,
      raw: profile._json,
    };
  }
}
