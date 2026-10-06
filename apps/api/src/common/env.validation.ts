// ============================================================================
// FILE: /apps/api/src/common/env.validation.ts
// ============================================================================
// Fail-fast at boot: the app refuses to start with missing or weak
// secrets. A misconfigured deployment is stopped before it can serve a
// single unauthenticated byte. Wired into ConfigModule via `validate`.

const PLACEHOLDER_PREFIX = 'change-me';
const MIN_SECRET_LENGTH = 32;

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const read = (key: string): string => {
    const value = config[key];
    return typeof value === 'string' ? value.trim() : '';
  };

  // Anything that is not explicitly development/test is treated as production.
  const nodeEnv = read('NODE_ENV');
  const isProduction = nodeEnv !== 'development' && nodeEnv !== 'test';

  const required: Array<[string, string]> = [
    ['AUTH_JWT_SECRET', 'JWT signing secret is required'],
    ['DATABASE_URL', 'Database URL is required'],
  ];
  if (isProduction) {
    required.push(
      ['CLIENT_URL', 'Client URL (CORS origin) is required in production'],
      ['AUTH_GOOGLE_CLIENT_ID', 'Google OAuth client id is required in production'],
      ['AUTH_GOOGLE_CLIENT_SECRET', 'Google OAuth client secret is required in production'],
      ['AUTH_GOOGLE_CALLBACK_URL', 'Google OAuth callback URL is required in production'],
      ['AUTH_FACEBOOK_CLIENT_ID', 'Facebook OAuth client id is required in production'],
      ['AUTH_FACEBOOK_CLIENT_SECRET', 'Facebook OAuth client secret is required in production'],
      ['AUTH_FACEBOOK_CALLBACK_URL', 'Facebook OAuth callback URL is required in production'],
    );
  }

  const problems: string[] = required.filter(([key]) => !read(key)).map(([, message]) => message);

  const secret = read('AUTH_JWT_SECRET');
  if (secret && secret.length < MIN_SECRET_LENGTH) {
    problems.push('AUTH_JWT_SECRET must be at least ' + MIN_SECRET_LENGTH + ' characters');
  }
  if (secret && secret.toLowerCase().startsWith(PLACEHOLDER_PREFIX)) {
    problems.push('AUTH_JWT_SECRET is still the .env.example placeholder — generate a real secret');
  }

  if (problems.length) {
    throw new Error('Environment validation failed: ' + problems.join('; '));
  }
  return config;
}
