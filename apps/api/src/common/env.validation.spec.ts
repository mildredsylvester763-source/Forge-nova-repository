// Validated environment contract: every rule in env.validation.ts is pinned
// here so a regression fails CI before it fails a deployment.

import { validateEnv } from './env.validation';

const BASE = {
  NODE_ENV: 'test',
  AUTH_JWT_SECRET: 'a'.repeat(48),
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/forge_nova',
};

describe('validateEnv', () => {
  it('passes a complete configuration through unchanged', () => {
    expect(validateEnv({ ...BASE })).toEqual(BASE);
  });

  it('rejects a missing JWT signing secret', () => {
    expect(() => validateEnv({ ...BASE, AUTH_JWT_SECRET: '' })).toThrow(/JWT signing secret is required/);
  });

  it('rejects whitespace-only values as missing', () => {
    expect(() => validateEnv({ ...BASE, AUTH_JWT_SECRET: '   ' })).toThrow(/JWT signing secret is required/);
  });

  it('rejects a secret shorter than 32 characters', () => {
    expect(() => validateEnv({ ...BASE, AUTH_JWT_SECRET: 'short-secret' })).toThrow(/at least 32 characters/);
  });

  it('rejects the .env.example placeholder even at full length', () => {
    const placeholder = 'change-me-' + 'x'.repeat(30);
    expect(() => validateEnv({ ...BASE, AUTH_JWT_SECRET: placeholder })).toThrow(/placeholder/);
  });

  it('rejects a missing database URL', () => {
    expect(() => validateEnv({ ...BASE, DATABASE_URL: '' })).toThrow(/Database URL is required/);
  });

  it('treats any non-development/test environment as production and demands the full contract', () => {
    expect(() => validateEnv({ ...BASE, NODE_ENV: 'production' })).toThrow(/Google OAuth client id is required in production/);
  });

  it('accepts a fully configured production environment', () => {
    const prod = {
      ...BASE,
      NODE_ENV: 'production',
      CLIENT_URL: 'https://app.forge-nova.example',
      AUTH_GOOGLE_CLIENT_ID: 'google-id',
      AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
      AUTH_GOOGLE_CALLBACK_URL: 'https://api.forge-nova.example/auth/google/callback',
      AUTH_FACEBOOK_CLIENT_ID: 'facebook-id',
      AUTH_FACEBOOK_CLIENT_SECRET: 'facebook-secret',
      AUTH_FACEBOOK_CALLBACK_URL: 'https://api.forge-nova.example/auth/facebook/callback',
    };
    expect(validateEnv(prod)).toEqual(prod);
  });
});
