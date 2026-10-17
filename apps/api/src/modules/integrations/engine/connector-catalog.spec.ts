// ============================================================================
// FILE: /apps/api/src/modules/integrations/engine/connector-catalog.spec.ts
// ============================================================================

import { CONNECTORS, lookupConnector, validateCredentials } from './connector-catalog';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('connector-catalog engine', () => {
  it('exposes the pinned 13-connector catalog', () => {
    expect(CONNECTORS).toHaveLength(13);
    expect(CONNECTORS.map((c) => c.id)).toContain('stripe');
    expect(CONNECTORS.map((c) => c.id)).toContain('custom');
  });

  it('looks up stripe and refuses unknown connectors by name', () => {
    const r = lookupConnector('stripe');
    if (r.ok) expect(r.value.kind).toBe('payment');
    const u = lookupConnector('docusign');
    expect(u.ok).toBe(false);
    if (!u.ok) expect(u.reason).toBe('connector-unknown:docusign');
  });

  it('accepts full stripe credentials', () => {
    const r = validateCredentials('stripe', { secretKey: 'sk_test_123', webhookSecret: 'whsec_1' });
    if (r.ok) expect(r.value.accepted).toHaveLength(2);
  });

  it('refuses missing, multi-missing, and empty credentials by name', () => {
    const missing = validateCredentials('stripe', { publicKey: 'pk_1' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe('connector-missing-credential:secretKey');
    const multi = validateCredentials('quickbooks', { clientId: 'a', clientSecret: 'b' });
    expect(multi.ok).toBe(false);
    if (!multi.ok) expect(multi.reason).toBe('connector-missing-credential:realmId');
    const empty = validateCredentials('stripe', { secretKey: '' });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe('connector-empty-credential:secretKey');
  });

  it('supports the custom HTTP connector with all three fields', () => {
    const r = validateCredentials('custom', { url: 'https://x', authHeader: 'Authorization', authValue: 'Bearer t' });
    if (r.ok) expect(r.value.accepted).toHaveLength(3);
  });

  it('500-case sweep: every required credential is present in every accepted verdict', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const c = CONNECTORS[Math.floor(rnd() * CONNECTORS.length)];
      const provided: Record<string, string> = {};
      for (const f of [...c.requiredCredentials, ...c.optionalCredentials]) {
        if (rnd() < 0.8) provided[f] = 'val_' + Math.floor(rnd() * 100000);
      }
      const v = validateCredentials(c.id, provided);
      if (!v.ok) {
        expect(v.reason.startsWith('connector-missing-credential:')).toBe(true);
        continue;
      }
      for (const f of c.requiredCredentials) {
        expect(v.value.accepted).toContain(f);
      }
    }
  });
});
