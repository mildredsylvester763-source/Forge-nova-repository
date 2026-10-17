// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/oauth-plan.ts
// ============================================================================
// The "tap to connect" flow, pinned. Builds provider authorization URLs
// (authorization-code grant), generates state and PKCE challenges, and
// decides refresh timing. Pure: the service performs the actual redirects
// and token exchanges; the engine decides everything.

export type Verdict<T> = { ok: true; value: T } | { ok: false, reason: string };

const CLIENT_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

export interface ProviderProfile {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  usePkce: boolean;
}

export function validateRedirectUri(uri: string): Verdict<{ origin: string }> {
  if (typeof uri !== 'string' || !uri.length) return { ok: false, reason: 'oauth-empty-redirect' };
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return { ok: false, reason: 'oauth-unparseable-redirect' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, reason: 'oauth-redirect-must-be-https' };
  if (parsed.hash || parsed.username || parsed.password) {
    return { ok: false, reason: 'oauth-redirect-malformed' };
  }
  if (/^localhost$|\.local$|\.internal$/i.test(parsed.hostname)) {
    return { ok: false, reason: 'oauth-redirect-local-hostname' };
  }
  return { ok: true, value: { origin: parsed.origin } };
}

export function validateScopes(requested: string[], allowed: string[]): Verdict<{ scopes: string[] }> {
  if (!Array.isArray(requested) || !requested.length) return { ok: false, reason: 'oauth-no-scopes' };
  const seen = new Set<string>();
  for (const s of requested) {
    if (typeof s !== 'string' || !/^[a-z0-9._:-]{1,120}$/.test(s)) {
      return { ok: false, reason: 'oauth-invalid-scope:' + String(s) };
    }
    if (seen.has(s)) return { ok: false, reason: 'oauth-duplicate-scope:' + s };
    seen.add(s);
    if (allowed.length && !allowed.includes(s)) {
      return { ok: false, reason: 'oauth-scope-not-offered:' + s };
    }
  }
  return { ok: true, value: { scopes: [...requested] } };
}

export interface AuthorizePlan {
  url: string;
  state: string;
  codeChallenge: string | null;
}

export function buildAuthorizePlan(
  provider: ProviderProfile,
  clientId: string,
  redirectUri: string,
  state: string,
  scopes: string[],
  codeChallenge: string | null,
): Verdict<AuthorizePlan> {
  if (!CLIENT_ID_PATTERN.test(clientId)) return { ok: false, reason: 'oauth-invalid-client-id' };
  const redirect = validateRedirectUri(redirectUri);
  if (!redirect.ok) return redirect;
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(state)) {
    return { ok: false, reason: 'oauth-invalid-state' };
  }
  const scope = validateScopes(scopes, provider.scopes);
  if (!scope.ok) return scope;
  if (provider.usePkce) {
    if (typeof codeChallenge !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
      return { ok: false, reason: 'oauth-missing-pkce-challenge' };
    }
  } else if (codeChallenge !== null) {
    return { ok: false, reason: 'oauth-pkce-not-supported' };
  }
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope.value.scopes.join(' '));
  url.searchParams.set('state', state);
  if (provider.usePkce && codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return { ok: true, value: { url: url.toString(), state, codeChallenge } };
}

export function validateCodeVerifier(verifier: string): Verdict<{ verifier: string }> {
  if (typeof verifier !== 'string' || !CODE_VERIFIER_PATTERN.test(verifier)) {
    return { ok: false, reason: 'oauth-invalid-code-verifier' };
  }
  return { ok: true, value: { verifier } };
}

// Refresh timing: refresh when the token has consumed refreshAtFraction of
// its life. Expired-but-unrefreshed is a refusal — a stale token must
// never be silently used.
export function shouldRefresh(
  issuedAtMs: number,
  expiresAtMs: number,
  nowMs: number,
  refreshAtFraction: number,
): Verdict<{ refresh: boolean; expired: boolean }> {
  if (!Number.isInteger(issuedAtMs) || !Number.isInteger(expiresAtMs) || !Number.isInteger(nowMs)) {
    return { ok: false, reason: 'oauth-invalid-times' };
  }
  if (expiresAtMs <= issuedAtMs) return { ok: false, reason: 'oauth-invalid-lifetime' };
  if (refreshAtFraction <= 0 || refreshAtFraction > 1) {
    return { ok: false, reason: 'oauth-invalid-refresh-fraction' };
  }
  const expired = nowMs >= expiresAtMs;
  const refresh = nowMs >= issuedAtMs + (expiresAtMs - issuedAtMs) * refreshAtFraction;
  return { ok: true, value: { refresh, expired } };
}
