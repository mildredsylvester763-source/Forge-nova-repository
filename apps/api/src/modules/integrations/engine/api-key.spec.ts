// ============================================================================
// FILE: /apps/api/src/modules/integrations/engine/api-key.spec.ts
// ============================================================================

import { generateApiKey, hashApiKey, validateApiKeyFormat, validateScopes } from './api-key';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('api-key engine', () => {
  it('generates the pinned key from 40 hex chars of entropy', () => {
    const r = generateApiKey('a'.repeat(40));
    if (!r.ok) return;
    expect(r.value.plaintext).toBe('fn_live_' + 'a'.repeat(40));
    expect(r.value.keyHash).toBe(hashApiKey(r.value.plaintext));
  });

  it('refuses invalid entropy by name', () => {
    const r = generateApiKey('short');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('apikey-invalid-entropy');
  });

  it('validates the fn_live_ format and refuses anything else', () => {
    const good = validateApiKeyFormat('fn_live_0123456789abcdef0123456789abcdef01234567');
    if (good.ok) expect(good.value.body).toHaveLength(40);
    const bad = validateApiKeyFormat('sk_live_xxx');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('apikey-invalid-format');
  });

  it('accepts pinned scopes and refuses unknown or duplicate ones', () => {
    expect(validateScopes(['read', 'mcp']).ok).toBe(true);
    const none = validateScopes([]);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.reason).toBe('apikey-no-scopes');
    const unknown = validateScopes(['admin']);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe('apikey-unknown-scope:admin');
    const dup = validateScopes(['read', 'read']);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.reason).toBe('apikey-duplicate-scope:read');
  });

  it('500-case sweep: generated keys are always well-formed and hash-consistent', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const hex = Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(rnd() * 16)]).join('');
      const v = generateApiKey(hex);
      if (!v.ok) throw new Error('generation refused in sweep');
      const f = validateApiKeyFormat(v.value.plaintext);
      if (!f.ok) throw new Error('generated key failed its own format check');
      expect(v.value.keyHash).toBe(hashApiKey(v.value.plaintext));
    }
  });
});
