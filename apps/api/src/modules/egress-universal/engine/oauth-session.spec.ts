import {
  planOAuthSession,
  sessionIsLive,
  validateCallback,
  buildTokenExchangeRequest,
  parseTokenResponse,
  buildRefreshRequest,
  SESSION_TTL_MS,
} from './oauth-session';

describe('oauth-session engine', () => {
  const STATE = 'state-1234567890ab';
  const VERIFIER = 'v'.repeat(43);
  const CHALLENGE = 'c'.repeat(43);
  const NOW = 1000000;

  it('plans a session with a 10 minute TTL', () => {
    const v = planOAuthSession(STATE, VERIFIER, CHALLENGE, NOW);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.state).toBe(STATE);
      expect(v.value.codeVerifier).toBe(VERIFIER);
      expect(v.value.codeChallenge).toBe(CHALLENGE);
      expect(v.value.expiresAtMs).toBe(NOW + SESSION_TTL_MS);
    }
    expect(SESSION_TTL_MS).toBe(10 * 60 * 1000);
  });

  it('refuses malformed session inputs with named reasons', () => {
    const a = planOAuthSession('short', VERIFIER, CHALLENGE, NOW);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('oauth-session-invalid-state');
    const b = planOAuthSession(STATE, 'v'.repeat(42), CHALLENGE, NOW);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('oauth-session-invalid-verifier');
    const c = planOAuthSession(STATE, VERIFIER, 'c'.repeat(42), NOW);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('oauth-session-invalid-challenge');
    const d = planOAuthSession(STATE, VERIFIER, CHALLENGE, 1.5);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toBe('oauth-session-invalid-now');
  });

  it('marks sessions live inside the TTL and dead after it', () => {
    const live = sessionIsLive(NOW, NOW + SESSION_TTL_MS - 1);
    expect(live.ok).toBe(true);
    if (live.ok) expect(live.value.live).toBe(true);
    const dead = sessionIsLive(NOW, NOW + SESSION_TTL_MS);
    expect(dead.ok).toBe(true);
    if (dead.ok) expect(dead.value.live).toBe(false);
    const bad = sessionIsLive(1.5, NOW);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('oauth-session-invalid-times');
  });

  it('validates a good callback', () => {
    const v = validateCallback({ state: STATE, code: 'abc12345' });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.state).toBe(STATE);
      expect(v.value.code).toBe('abc12345');
    }
  });

  it('refuses denied callbacks and malformed ones', () => {
    const a = validateCallback({ error: 'access_denied', error_description: 'nope' });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('oauth-callback-denied:access_denied:nope');
    const b = validateCallback({ code: 'abc12345' });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('oauth-callback-invalid-state');
    const c = validateCallback({ state: STATE });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('oauth-callback-missing-code');
  });

  it('builds a PKCE token exchange with the secret in the body', () => {
    const v = buildTokenExchangeRequest(
      'https://provider.example/token',
      { usePkce: true, secretInBody: true },
      'client-12345',
      'secret-12345',
      'abc12345',
      'https://app.example/callback',
      VERIFIER,
    );
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.body.grant_type).toBe('authorization_code');
      expect(v.value.body.code).toBe('abc12345');
      expect(v.value.body.code_verifier).toBe(VERIFIER);
      expect(v.value.body.client_secret).toBe('secret-12345');
      expect(v.value.basicAuth).toBeUndefined();
    }
  });

  it('moves the secret to basic auth when the profile demands it', () => {
    const v = buildTokenExchangeRequest(
      'https://provider.example/token',
      { usePkce: false, secretInBody: false },
      'client-12345',
      'secret-12345',
      'abc12345',
      'https://app.example/callback',
      null,
    );
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.body.client_secret).toBeUndefined();
      expect(v.value.basicAuth).toEqual({
        username: 'client-12345',
        password: 'secret-12345',
      });
    }
  });

  it('refuses broken exchange requests with named reasons', () => {
    const base = ['https://provider.example/token', { usePkce: true, secretInBody: true }, 'client-12345', 'secret-12345', 'abc12345', 'https://app.example/callback', VERIFIER] as const;
    const a = buildTokenExchangeRequest('http://insecure.example/token', base[1], base[2], base[3], base[4], base[5], base[6]);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('oauth-token-url-invalid');
    const b = buildTokenExchangeRequest(base[0], base[1], 'short', base[3], base[4], base[5], base[6]);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('oauth-invalid-client-id');
    const c = buildTokenExchangeRequest(base[0], base[1], base[2], 'tiny', base[4], base[5], base[6]);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('oauth-invalid-client-secret');
    const d = buildTokenExchangeRequest(base[0], base[1], base[2], base[3], base[4], 'http://app.example/cb', base[6]);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toBe('oauth-redirect-must-be-https');
    const e = buildTokenExchangeRequest(base[0], { usePkce: true, secretInBody: true }, base[2], base[3], base[4], base[5], null);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.reason).toBe('oauth-invalid-code-verifier');
    const f = buildTokenExchangeRequest(base[0], { usePkce: false, secretInBody: true }, base[2], base[3], base[4], base[5], VERIFIER);
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.reason).toBe('oauth-pkce-not-supported');
  });

  it('parses a complete token response', () => {
    const v = parseTokenResponse(
      { access_token: 'token-123456', refresh_token: 'refresh-123456', expires_in: 3600, scope: 'read write' },
      NOW,
    );
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.accessToken).toBe('token-123456');
      expect(v.value.refreshToken).toBe('refresh-123456');
      expect(v.value.expiresAtMs).toBe(NOW + 3600000);
      expect(v.value.scopes).toEqual(['read', 'write']);
    }
  });

  it('accepts a minimal token response and rejects malformed ones', () => {
    const ok = parseTokenResponse({ access_token: 'token-123456' }, NOW);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.refreshToken).toBeNull();
      expect(ok.value.expiresAtMs).toBeNull();
      expect(ok.value.scopes).toEqual([]);
    }
    const denied = parseTokenResponse({ error: 'invalid_grant' }, NOW);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe('oauth-token-exchange-rejected:invalid_grant');
    const noToken = parseTokenResponse({ foo: 'bar' }, NOW);
    expect(noToken.ok).toBe(false);
    if (!noToken.ok) expect(noToken.reason).toBe('oauth-token-response-no-access-token');
    const badLife = parseTokenResponse({ access_token: 'token-123456', expires_in: -5 }, NOW);
    expect(badLife.ok).toBe(false);
    if (!badLife.ok) expect(badLife.reason).toBe('oauth-token-response-invalid-lifetime');
    const badScope = parseTokenResponse({ access_token: 'token-123456', scope: '  ' }, NOW);
    expect(badScope.ok).toBe(false);
    if (!badScope.ok) expect(badScope.reason).toBe('oauth-token-response-invalid-scope');
    const malformed = parseTokenResponse('nope', NOW);
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.reason).toBe('oauth-token-response-malformed');
  });

  it('builds refresh requests in both secret transports', () => {
    const body = buildRefreshRequest(
      'https://provider.example/token',
      { secretInBody: true },
      'client-12345',
      'secret-12345',
      'refresh-123456',
    );
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.value.body.grant_type).toBe('refresh_token');
      expect(body.value.body.client_secret).toBe('secret-12345');
    }
    const basic = buildRefreshRequest(
      'https://provider.example/token',
      { secretInBody: false },
      'client-12345',
      'secret-12345',
      'refresh-123456',
    );
    expect(basic.ok).toBe(true);
    if (basic.ok) {
      expect(basic.value.basicAuth).toEqual({ username: 'client-12345', password: 'secret-12345' });
    }
    const bad = buildRefreshRequest('https://provider.example/token', { secretInBody: true }, 'client-12345', 'secret-12345', 'short');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('oauth-invalid-refresh-token');
  });
});
