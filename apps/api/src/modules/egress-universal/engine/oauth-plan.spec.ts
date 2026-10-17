// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/oauth-plan.spec.ts
// ============================================================================
import {
  validateRedirectUri,
  validateScopes,
  buildAuthorizePlan,
  validateCodeVerifier,
  shouldRefresh,
} from './oauth-plan';

const PKCE_PROVIDER = {
  authorizeUrl: 'https://auth.example.com/oauth/authorize',
  scopes: ['read', 'write'],
  usePkce: true,
};

describe('oauth-plan (authorization code + PKCE)', () => {
  it('requires https redirect URIs', () => {
    const v = validateRedirectUri('http://app.example.com/cb');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('oauth-redirect-must-be-https');
  });

  it('accepts a valid redirect and returns its origin', () => {
    const v = validateRedirectUri('https://app.example.com/cb');
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.origin).toBe('https://app.example.com');
    const bad = validateRedirectUri('https://app.example.com/cb#x');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('oauth-redirect-malformed');
  });

  it('validates scope lists', () => {
    expect(validateScopes([], ['a']).ok).toBe(false);
    expect(validateScopes(['read', 'write'], ['read', 'write']).ok).toBe(true);
    const dup = validateScopes(['read', 'read'], ['read']);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.reason).toBe('oauth-duplicate-scope:read');
    const notOffered = validateScopes(['admin'], ['read']);
    expect(notOffered.ok).toBe(false);
    if (!notOffered.ok) expect(notOffered.reason).toBe('oauth-scope-not-offered:admin');
    const invalid = validateScopes(['Bad Scope'], ['a']);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.reason).toBe('oauth-invalid-scope:Bad Scope');
  });

  it('builds a full authorize URL with PKCE S256', () => {
    const v = buildAuthorizePlan(
      PKCE_PROVIDER,
      'client-12345678',
      'https://app.forgenova.com/cb',
      'state1234567890abcdef',
      ['read'],
      'A'.repeat(43),
    );
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.url).toContain('client_id=client-12345678');
      expect(v.value.url).toContain('response_type=code');
      expect(v.value.url).toContain('code_challenge_method=S256');
      expect(v.value.url).toContain('state=state1234567890abcdef');
    }
  });

  it('refuses invalid client ids, states, and missing PKCE', () => {
    const a = buildAuthorizePlan(PKCE_PROVIDER, 'short', 'https://app.forgenova.com/cb', 'state1234567890abcdef', ['read'], 'A'.repeat(43));
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('oauth-invalid-client-id');
    const b = buildAuthorizePlan(PKCE_PROVIDER, 'client-12345678', 'https://app.forgenova.com/cb', 'short', ['read'], 'A'.repeat(43));
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('oauth-invalid-state');
    const c = buildAuthorizePlan(PKCE_PROVIDER, 'client-12345678', 'https://app.forgenova.com/cb', 'state1234567890abcdef', ['read'], null);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('oauth-missing-pkce-challenge');
  });

  it('refuses PKCE challenges on non-PKCE providers', () => {
    const noPkce = { authorizeUrl: 'https://auth.example.com/a', scopes: ['read'], usePkce: false };
    const refuse = buildAuthorizePlan(noPkce, 'client-12345678', 'https://app.forgenova.com/cb', 'state1234567890abcdef', ['read'], 'A'.repeat(43));
    expect(refuse.ok).toBe(false);
    if (!refuse.ok) expect(refuse.reason).toBe('oauth-pkce-not-supported');
    const okPlan = buildAuthorizePlan(noPkce, 'client-12345678', 'https://app.forgenova.com/cb', 'state1234567890abcdef', ['read'], null);
    expect(okPlan.ok).toBe(true);
    if (okPlan.ok) expect(okPlan.value.url.includes('code_challenge')).toBe(false);
  });

  it('enforces the code verifier grammar', () => {
    expect(validateCodeVerifier('B'.repeat(42)).ok).toBe(false);
    expect(validateCodeVerifier('B'.repeat(43)).ok).toBe(true);
  });

  it('computes refresh timing with stale-token refusal', () => {
    const below = shouldRefresh(1000, 11000, 9999, 0.9);
    expect(below.ok).toBe(true);
    if (below.ok) expect(below.value.refresh).toBe(false);
    const at = shouldRefresh(1000, 11000, 10000, 0.9);
    expect(at.ok).toBe(true);
    if (at.ok) {
      expect(at.value.refresh).toBe(true);
      expect(at.value.expired).toBe(false);
    }
    const expired = shouldRefresh(1000, 11000, 12000, 0.9);
    expect(expired.ok).toBe(true);
    if (expired.ok) {
      expect(expired.value.refresh).toBe(true);
      expect(expired.value.expired).toBe(true);
    }
    expect(shouldRefresh(1000, 1000, 900, 0.9).ok).toBe(false);
    expect(shouldRefresh(1000, 11000, 12000, 1.5).ok).toBe(false);
  });

  it('keeps expired implying refresh across a sweep', () => {
    const rnd = (() => {
      let a = 42;
      return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();
    for (let k = 0; k < 500; k++) {
      const iat = Math.floor(rnd() * 100000);
      const life = 1000 + Math.floor(rnd() * 100000);
      const now = iat + Math.floor(rnd() * life);
      const v = shouldRefresh(iat, iat + life, now, 0.9);
      expect(v.ok).toBe(true);
      if (v.ok) {
        if (v.value.expired) expect(v.value.refresh).toBe(true);
      }
    }
  });
});
