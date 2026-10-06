# ============================================================================
# FILE: /apps/api/src/common/env.validation.ts
// ============================================================================
// Fail-fast at boot: the app refuses to start with missing or weak
// secrets. A misconfigured deployment is stopped before it can serve a
// single unauthenticated byte.

export function validateEnv(config: Record<string, any>): void {
  const required: Array<[string, string]> = [
    ['AUTH_JWT_SECRET', 'JWT signing secret is required'],
  ];
  if (config.NODE_ENV === 'production') {
    required.push(
      ['DATABASE_URL', 'Database URL is required in production'],
      ['AUTH_GOOGLE_CLIENT_ID', 'Google OAuth client id is required in production'],
      ['AUTH_GOOGLE_CLIENT_SECRET', 'Google OAuth client secret is required in production'],
      ['AUTH_FACEBOOK_CLIENT_ID', 'Facebook OAuth client id is required in production'],
      ['AUTH_FACEBOOK_CLIENT_SECRET', 'Facebook OAuth client secret is required in production'],
    );
  }
  const missing = required.filter(([key]) => !config[key]);
  if (missing.length) {
    throw new Error('Environment validation failed: ' + missing.map(([, msg]) => msg).join('; '));
  }
  if (config.AUTH_JWT_SECRET && config.AUTH_JWT_SECRET.length < 32) {
    throw new Error('AUTH_JWT_SECRET must be at least 32 characters');
  }
}
