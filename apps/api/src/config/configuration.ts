// ============================================================================
// FILE: /apps/api/src/config/configuration.ts
// ============================================================================
// Maps flat environment variables onto the namespaced keys the code reads
// (database.url, auth.jwtSecret, ...). Without this, every ConfigService
// lookup of a namespaced key returned undefined.

export default () => ({
  // Unset NODE_ENV is treated as production: no schema sync, strict validation.
  nodeEnv: process.env.NODE_ENV ?? 'production',
  port: Number.parseInt(process.env.PORT ?? '', 10) || 3000,
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:3001',
  database: {
    url: process.env.DATABASE_URL,
  },
  auth: {
    jwtSecret: process.env.AUTH_JWT_SECRET,
    google: {
      clientId: process.env.AUTH_GOOGLE_CLIENT_ID,
      clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET,
      callbackUrl: process.env.AUTH_GOOGLE_CALLBACK_URL,
    },
    facebook: {
      clientId: process.env.AUTH_FACEBOOK_CLIENT_ID,
      clientSecret: process.env.AUTH_FACEBOOK_CLIENT_SECRET,
      callbackUrl: process.env.AUTH_FACEBOOK_CALLBACK_URL,
    },
  },
});
