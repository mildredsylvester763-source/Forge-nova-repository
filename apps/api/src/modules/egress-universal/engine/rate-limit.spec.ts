import {
  newBucket,
  refillBucket,
  takeToken,
  BucketState,
} from './rate-limit';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('engine/rate-limit (token bucket)', () => {
  it('starts full and refuses invalid capacity', () => {
    const nb = newBucket(60, 1000);
    expect(nb.ok).toBe(true);
    if (nb.ok) {
      expect(nb.value.tokens).toBe(60);
      expect(nb.value.lastRefillMs).toBe(1000);
    }
    expect(newBucket(0, 1000).ok).toBe(false);
    expect(newBucket(10001, 1000).ok).toBe(false);
    expect(newBucket(60, -1).ok).toBe(false);
  });

  it('allows a full burst then refuses by name', () => {
    const nb = newBucket(60, 1000);
    if (!nb.ok) throw new Error('pin');
    let state: BucketState = nb.value;
    for (let i = 0; i < 60; i++) {
      const t = takeToken(state, 60, 60, 2000, 1);
      expect(t.ok).toBe(true);
      if (t.ok) state = t.value.state;
    }
    expect(state.tokens).toBe(0);
    const over = takeToken(state, 60, 60, 2000, 1);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe('rate-limit-exceeded');
  });

  it('refills by elapsed wall time and never exceeds capacity', () => {
    const empty: BucketState = { tokens: 0, lastRefillMs: 1000 };
    const r = refillBucket(empty, 60, 60, 1000 + 60000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.tokens).toBe(60);
    const partial = takeToken({ tokens: 0, lastRefillMs: 0 }, 60, 60, 30000, 1);
    expect(partial.ok).toBe(true);
    if (partial.ok) expect(partial.value.state.tokens).toBe(29);
    const capped = refillBucket({ tokens: 59, lastRefillMs: 0 }, 60, 60, 600000);
    expect(capped.ok).toBe(true);
    if (capped.ok) expect(capped.value.tokens).toBe(60);
  });

  it('refuses a clock that goes backwards', () => {
    const r = refillBucket({ tokens: 5, lastRefillMs: 5000 }, 60, 60, 4000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('rate-limit-clock-went-backwards');
  });

  it('refuses invalid costs and states by name', () => {
    const st: BucketState = { tokens: 10, lastRefillMs: 0 };
    expect(takeToken(st, 60, 60, 0, 0).ok).toBe(false);
    expect(takeToken(st, 60, 60, 0, 101).ok).toBe(false);
    expect(takeToken({ tokens: -1, lastRefillMs: 0 } as BucketState, 60, 60, 0, 1).ok).toBe(false);
    expect(takeToken({ tokens: 1, lastRefillMs: -5 } as BucketState, 60, 60, 0, 1).ok).toBe(false);
    expect(refillBucket({ tokens: 1.5, lastRefillMs: 0 } as BucketState, 60, 60, 100).ok).toBe(false);
  });

  it('mulberry32 500-case sweep (seed 42): tokens stay in range', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const capacity = 1 + Math.floor(rnd() * 200);
      const refill = 1 + Math.floor(rnd() * 200);
      const now = Math.floor(rnd() * 1e9);
      const tokens = Math.floor(rnd() * (capacity + 5));
      const state: BucketState = { tokens, lastRefillMs: now - Math.floor(rnd() * 120000) };
      const cost = 1 + Math.floor(rnd() * 3);
      const t = takeToken(state, capacity, refill, now, cost);
      if (!t.ok) continue;
      expect(t.value.state.tokens).toBeGreaterThanOrEqual(0);
      expect(t.value.state.tokens).toBeLessThanOrEqual(capacity);
    }
  });
});
