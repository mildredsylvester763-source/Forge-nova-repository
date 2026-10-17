// ============================================================================
// FILE: /apps/api/src/modules/integrations/engine/api-key.ts
// ============================================================================

// API keys are generated once, shown once, stored only as a SHA-256 hash.
// The engine is pure: generation is deterministic given a source string,
// format validation and hashing are pure functions. No DB, no clock.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface GeneratedKey {
  plaintext: string;
  keyHash: string;
}

const KEY_PREFIX = 'fn_live_';

// Pure FNV-1a-based pseudo-hash for sandbox verification of the pipeline;
// the real SHA-256 lives in the service (Node crypto). This function only
// proves structure: prefix + 40 hex chars, deterministic.
export function generateApiKey(randomHex: string): Verdict<GeneratedKey> {
  if (typeof randomHex !== 'string' || !/^[0-9a-f]{40}$/.test(randomHex)) {
    return { ok: false, reason: 'apikey-invalid-entropy' };
  }
  const plaintext = KEY_PREFIX + randomHex;
  return { ok: true, value: { plaintext, keyHash: hashApiKey(plaintext) } };
}

export function validateApiKeyFormat(key: string): Verdict<{ prefix: string; body: string }> {
  if (typeof key !== 'string' || !key.length) return { ok: false, reason: 'apikey-invalid-format' };
  const m = key.match(/^(fn_live_[0-9a-f]{40})$/);
  if (!m) return { ok: false, reason: 'apikey-invalid-format' };
  return { ok: true, value: { prefix: 'fn_live_', body: key.slice(KEY_PREFIX.length) } };
}

// Deterministic digest used by the sandbox spec; the service overrides
// this with crypto.createHash('sha256'). Both must agree on "hash(key)".
export function hashApiKey(key: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < key.length; i++) {
    h1 ^= key.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (Math.imul(h2 ^ key.charCodeAt(i), 0x85ebca6b) + 0x165667b1) >>> 0;
  }
  return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
}

export interface ApiKeyScopes {
  scopes: string[];
}

export function validateScopes(scopes: unknown): Verdict<ApiKeyScopes> {
  const ALL = ['read', 'write', 'mcp', 'webhooks'];
  if (!Array.isArray(scopes) || !scopes.length) return { ok: false, reason: 'apikey-no-scopes' };
  const seen = new Set<string>();
  for (const s of scopes) {
    if (typeof s !== 'string' || !ALL.includes(s)) return { ok: false, reason: 'apikey-unknown-scope:' + String(s) };
    if (seen.has(s)) return { ok: false, reason: 'apikey-duplicate-scope:' + s };
    seen.add(s);
  }
  return { ok: true, value: { scopes: [...scopes] } };
}
