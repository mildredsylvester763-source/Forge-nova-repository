// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/oauth-session.ts
// ============================================================================
// The OAuth connection session engine: pure decisions for the browser
// "tap to connect" flow. The service performs network I/O; this engine
// decides everything: session shape, TTL, callback validation, token
// exchange request construction, and token response parsing. Nothing is
// guessed, every refusal is named.

export type Verdict<T> = { ok: true; value: T } | { ok: false, reason: string };

// ---------------------------------------------------------------- sessions

export const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes, one shot.

const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const CODE_PATTERN = /^[A-Za-z0-9._~+-]{8,512}$/;
const AUTH_CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

export interface OAuthSessionPlan {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  expiresAtMs: number;
}

// Validates a freshly generated (state, verifier, challenge) triple against
// the exact patterns the OAuth plan engine enforces. The caller generates
// randomness; this pins that it is usable.
export function planOAuthSession(
  state: string,
  codeVerifier: string,
  codeChallenge: string,
  nowMs: number,
): Verdict<OAuthSessionPlan> {
  if (typeof state !== 'string' || !STATE_PATTERN.test(state)) {
    return { ok: false, reason: 'oauth-session-invalid-state' };
  }
  if (typeof codeVerifier !== 'string' || !AUTH_CODE_VERIFIER_PATTERN.test(codeVerifier)) {
    return { ok: false, reason: 'oauth-session-invalid-verifier' };
  }
  if (typeof codeChallenge !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    return { ok: false, reason: 'oauth-session-invalid-challenge' };
  }
  if (!Number.isInteger(nowMs)) return { ok: false, reason: 'oauth-session-invalid-now' };
  return { ok: true, value: { state, codeVerifier, codeChallenge, expiresAtMs: nowMs + SESSION_TTL_MS } };
}

export function sessionIsLive(createdAtMs: number, nowMs: number): Verdict<{ live: boolean }> {
  if (!Number.isInteger(createdAtMs) || !Number.isInteger(nowMs)) {
    return { ok: false, reason: 'oauth-session-invalid-times' };
  }
  return { ok: true, value: { live: nowMs - createdAtMs < SESSION_TTL_MS } };
}

// --------------------------------------------------------------- callbacks

// A provider redirect either carries an error (user denied, provider
// failure) or an authorization code. Both state and code are validated
// by pattern before anything touches the database.
export function validateCallback(
  query: { state?: unknown; code?: unknown; error?: unknown; error_description?: unknown },
): Verdict<{ state: string; code: string }> {
  if (typeof query.error === 'string' && query.error.length) {
    const desc = typeof query.error_description === 'string'
      ? ':' + query.error_description.slice(0, 200)
      : '';
    return { ok: false, reason: 'oauth-callback-denied:' + String(query.error).slice(0, 80) + desc };
  }
  if (typeof query.state !== 'string' || !STATE_PATTERN.test(query.state)) {
    return { ok: false, reason: 'oauth-callback-invalid-state' };
  }
  if (typeof query.code !== 'string' || !CODE_PATTERN.test(query.code)) {
    return { ok: false, reason: 'oauth-callback-missing-code' };
  }
  return { ok: true, value: { state: query.state, code: query.code } };
}

// ------------------------------------------------------- token exchange

export interface TokenExchangeRequest {
  url: string;
  body: Record<string, string>;
  basicAuth?: { username: string; password: string };
}

// Builds the exact POST the provider expects for the authorization-code
// grant. client_secret is transported either in the body (default) or via
// HTTP Basic auth (the RFC 6749 preferred spelling), per provider profile.
export function buildTokenExchangeRequest(
  tokenUrl: string,
  provider: { usePkce: boolean; secretInBody: boolean },
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
  codeVerifier: string | null,
): Verdict<TokenExchangeRequest> {
  if (typeof tokenUrl !== 'string' || !/^https:\/\/[A-Za-z0-9.-]{1,200}(\/[^\s]*)?$/.test(tokenUrl)) {
    return { ok: false, reason: 'oauth-token-url-invalid' };
  }
  if (!/^[A-Za-z0-9._-]{8,128}$/.test(clientId ?? '')) {
    return { ok: false, reason: 'oauth-invalid-client-id' };
  }
  if (typeof clientSecret !== 'string' || clientSecret.length < 8 || clientSecret.length > 512) {
    return { ok: false, reason: 'oauth-invalid-client-secret' };
  }
  if (!CODE_PATTERN.test(code ?? '')) return { ok: false, reason: 'oauth-callback-missing-code' };
  if (typeof redirectUri !== 'string' || !redirectUri.startsWith('https://')) {
    return { ok: false, reason: 'oauth-redirect-must-be-https' };
  }
  if (provider.usePkce) {
    if (typeof codeVerifier !== 'string' || !AUTH_CODE_VERIFIER_PATTERN.test(codeVerifier)) {
      return { ok: false, reason: 'oauth-invalid-code-verifier' };
    }
  } else if (codeVerifier !== null) {
    return { ok: false, reason: 'oauth-pkce-not-supported' };
  }
  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
  };
  const req: TokenExchangeRequest = { url: tokenUrl, body };
  if (provider.secretInBody) {
    body.client_secret = clientSecret;
  } else {
    req.basicAuth = { username: clientId, password: clientSecret };
  }
  if (provider.usePkce && codeVerifier) {
    body.code_verifier = codeVerifier;
  }
  return { ok: true, value: req };
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken: string | null;
  expiresAtMs: number | null;
  scopes: string[];
}

// Parses the provider token endpoint response. Never trusts a malformed
// payload: access_token is mandatory, everything else is optional but
// must be well-formed when present.
export function parseTokenResponse(
  payload: unknown,
  nowMs: number,
): Verdict<TokenExchangeResult> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, reason: 'oauth-token-response-malformed' };
  }
  const obj = payload as Record<string, unknown>;
  if (typeof obj.error === 'string' && obj.error.length) {
    return { ok: false, reason: 'oauth-token-exchange-rejected:' + String(obj.error).slice(0, 80) };
  }
  const accessToken = obj.access_token;
  if (typeof accessToken !== 'string' || accessToken.length < 8 || accessToken.length > 4096) {
    return { ok: false, reason: 'oauth-token-response-no-access-token' };
  }
  let refreshToken: string | null = null;
  if (obj.refresh_token !== undefined) {
    if (typeof obj.refresh_token !== 'string' || obj.refresh_token.length < 8 || obj.refresh_token.length > 4096) {
      return { ok: false, reason: 'oauth-token-response-invalid-refresh-token' };
    }
    refreshToken = obj.refresh_token;
  }
  let expiresAtMs: number | null = null;
  if (obj.expires_in !== undefined) {
    const seconds = obj.expires_in;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0 || seconds > 3600 * 24 * 365) {
      return { ok: false, reason: 'oauth-token-response-invalid-lifetime' };
    }
    expiresAtMs = nowMs + Math.floor(seconds) * 1000;
  }
  let scopes: string[] = [];
  if (obj.scope !== undefined) {
    if (typeof obj.scope !== 'string' || obj.scope.length > 2000) {
      return { ok: false, reason: 'oauth-token-response-invalid-scope' };
    }
    scopes = obj.scope.split(' ').filter((s) => s.length);
    if (!scopes.length) return { ok: false, reason: 'oauth-token-response-invalid-scope' };
  }
  return { ok: true, value: { accessToken, refreshToken, expiresAtMs, scopes } };
}

// Refresh request: same discipline, refresh_token grant.
export function buildRefreshRequest(
  tokenUrl: string,
  provider: { secretInBody: boolean },
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Verdict<TokenExchangeRequest> {
  if (typeof tokenUrl !== 'string' || !/^https:\/\/[A-Za-z0-9.-]{1,200}(\/[^\s]*)?$/.test(tokenUrl)) {
    return { ok: false, reason: 'oauth-token-url-invalid' };
  }
  if (!/^[A-Za-z0-9._-]{8,128}$/.test(clientId ?? '')) {
    return { ok: false, reason: 'oauth-invalid-client-id' };
  }
  if (typeof refreshToken !== 'string' || refreshToken.length < 8 || refreshToken.length > 4096) {
    return { ok: false, reason: 'oauth-invalid-refresh-token' };
  }
  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  };
  const req: TokenExchangeRequest = { url: tokenUrl, body };
  if (provider.secretInBody) {
    body.client_secret = clientSecret;
  } else {
    req.basicAuth = { username: clientId, password: clientSecret };
  }
  return { ok: true, value: req };
}
