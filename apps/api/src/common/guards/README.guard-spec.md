// ============================================================================
// FILE: /apps/api/src/common/guards/README.guard-spec.md
// ============================================================================
// THE COMPLETE DOOR POLICY (global-auth.guard)
//
// PRIVATE BY DEFAULT — every route in the entire API requires a valid JWT
// for an ACTIVE account. No controller opts in.
//
// PUBLIC DOORS — the complete list, nothing else may be added without
// a security justification in this file:
//
//   POST /api/v1/auth/register         — account creation (email + password)
//   POST /api/v1/auth/login            — email + password login
//   GET  /api/v1/auth/google           — start Google OAuth
//   GET  /api/v1/auth/google/callback   — Google OAuth callback
//   GET  /api/v1/auth/facebook         — start Facebook OAuth
//   GET  /api/v1/auth/facebook/callback — Facebook OAuth callback
//   POST /api/v1/auth/refresh          — refresh token rotation
//
// ADDITIONAL RULES
// - JwT_STRATEGY re-validates account status on EVERY request: a suspended
//   account's valid token is still rejected.
// - Refresh token reuse anywhere kills the whole token family (theft).
// - 5 failed logins lock the account for 15 minutes.
// - Global ValidationPipe strips and rejects unknown body fields.
