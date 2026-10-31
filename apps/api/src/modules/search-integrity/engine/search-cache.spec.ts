import { normalizeCacheKey, cacheState, checkRate } from './search-cache';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('search-cache engine (FORGE AI-070)', () => {
  it('normalizes keys deterministically and refuses blank keys', () => {
    expect(normalizeCacheKey('  Best   Practices  ')).toMatchObject({ ok: true, key: 'best practices' });
    expect(normalizeCacheKey('   ')).toMatchObject({ ok: false, reason: 'cache-key-missing' });
  });

  it('classifies cache entries as fresh, stale or expired', () => {
    const fresh = cacheState({ now: 1000, entry: { key: 'k', createdAt: 900, ttlSeconds: 300, hitCount: 2 } });
    expect(fresh).toMatchObject({ ok: true, state: 'fresh', ageSeconds: 100, hitCount: 2 });
    const stale = cacheState({ now: 1000, entry: { key: 'k', createdAt: 700, ttlSeconds: 300 } });
    expect(stale).toMatchObject({ state: 'stale', hitCount: 0 });
    const expired = cacheState({ now: 1000, entry: { key: 'k', createdAt: 400, ttlSeconds: 300 } });
    expect(expired).toMatchObject({ state: 'expired' });
  });

  it('refuses invalid ttl with a named reason', () => {
    expect(cacheState({ now: 1000, entry: { key: 'k', createdAt: 900, ttlSeconds: 0 } })).toMatchObject({
      ok: false,
      reason: 'cache-ttl-invalid:0',
    });
  });

  it('manages the token bucket with cap, refill and spend', () => {
    const refilled = checkRate({ tokens: 5, capacity: 10, refillPerMinute: 2, elapsedMinutes: 3 });
    expect(refilled).toMatchObject({ ok: true, allowed: true, tokens: 9, capacity: 10, refillPerMinute: 2 });
    const blocked = checkRate({ tokens: 0, capacity: 10, refillPerMinute: 0, elapsedMinutes: 5 });
    expect(blocked).toMatchObject({ ok: true, allowed: false, tokens: 0 });
    expect(checkRate({ tokens: 1, capacity: 0 })).toMatchObject({ ok: false, reason: 'bucket-capacity-invalid:0' });
    expect(checkRate({ tokens: 1, capacity: 10, refillPerMinute: -1 })).toMatchObject({
      ok: false,
      reason: 'bucket-refill-invalid:-1',
    });
  });

  it('matches an independent oracle on 500 mulberry32(42) cases', () => {
    const rand = mulberry32(42);
    for (let c = 0; c < 500; c++) {
      const ttl = 1 + Math.floor(rand() * 3600);
      const createdAt = Math.floor(rand() * 100000);
      const age = Math.floor(rand() * 7200);
      const now = createdAt + age;
      const hitCount = Math.floor(rand() * 50);
      const got = cacheState({ now, entry: { key: 'k-' + c, createdAt, ttlSeconds: ttl, hitCount } });
      const wantState = age > ttl ? 'expired' : age >= Math.floor(ttl * 0.5) ? 'stale' : 'fresh';
      expect(got).toMatchObject({ ok: true, state: wantState, hitCount });

      const capacity = 1 + Math.floor(rand() * 100);
      const refill = Math.floor(rand() * 50);
      const tokens = Math.floor(rand() * (capacity + 5));
      const elapsed = Math.floor(rand() * 30);
      const rg = checkRate({ tokens, capacity, refillPerMinute: refill, elapsedMinutes: elapsed });
      const wantTokens = Math.min(capacity, Math.floor(tokens + elapsed * refill));
      const wantAllowed = wantTokens >= 1;
      expect(rg.allowed).toBe(wantAllowed);
      expect(rg.tokens).toBe(wantAllowed ? wantTokens - 1 : wantTokens);
    }
  });
});
