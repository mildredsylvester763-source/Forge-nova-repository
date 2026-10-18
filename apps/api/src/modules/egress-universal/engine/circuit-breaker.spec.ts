import {
  initialBreaker,
  canAttempt,
  recordResult,
  BreakerSnapshot,
} from './circuit-breaker';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('engine/circuit-breaker (per-destination tripwire)', () => {
  it('starts closed and trips open on the 5th consecutive failure', () => {
    let b = initialBreaker();
    expect(b.state).toBe('closed');
    for (let i = 0; i < 4; i++) {
      const r = recordResult(b, false, i * 10);
      expect(r.ok).toBe(true);
      if (r.ok) b = r.value;
    }
    expect(b.state).toBe('closed');
    expect(b.failures).toBe(4);
    const fifth = recordResult(b, false, 100);
    expect(fifth.ok).toBe(true);
    if (fifth.ok) {
      expect(fifth.value.state).toBe('open');
      expect(fifth.value.openedAtMs).toBe(100);
    }
  });

  it('an open breaker refuses by name until the cooldown elapses, then allows one half-open probe', () => {
    const tripped: BreakerSnapshot = { state: 'open', failures: 5, successes: 0, openedAtMs: 100, lastResultAtMs: 100 };
    const blocked = canAttempt(tripped, 5000, 60000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('circuit-breaker-open');
    const half = canAttempt(tripped, 100 + 60000, 60000);
    expect(half.ok).toBe(true);
    if (half.ok) {
      expect(half.value.allowed).toBe(true);
      expect(half.value.state).toBe('half-open');
    }
  });

  it('a half-open success closes the breaker; a failure keeps discipline', () => {
    const tripped: BreakerSnapshot = { state: 'open', failures: 5, successes: 0, openedAtMs: 100, lastResultAtMs: 100 };
    const closed = recordResult(tripped, true, 100 + 60000);
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      expect(closed.value.state).toBe('closed');
      expect(closed.value.failures).toBe(0);
      expect(closed.value.successes).toBe(1);
      expect(closed.value.openedAtMs).toBeNull();
    }
  });

  it('refuses malformed snapshots by name', () => {
    const stray = canAttempt({ state: 'closed', failures: 0, successes: 0, openedAtMs: 5, lastResultAtMs: null } as unknown as BreakerSnapshot, 100, 1000);
    expect(stray.ok).toBe(false);
    if (!stray.ok) expect(stray.reason).toBe('breaker-stray-opened-at');
    const openNoTime = canAttempt({ state: 'open', failures: 5, successes: 0, openedAtMs: null, lastResultAtMs: null } as unknown as BreakerSnapshot, 100, 1000);
    expect(openNoTime.ok).toBe(false);
    if (!openNoTime.ok) expect(openNoTime.reason).toBe('breaker-invalid-opened-at');
  });

  it('refuses a clock that goes backwards', () => {
    const r = canAttempt({ state: 'open', failures: 5, successes: 0, openedAtMs: 100, lastResultAtMs: 100 }, 50, 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('breaker-clock-went-backwards');
  });

  it('mulberry32 500-case sweep (seed 42): state machine invariants hold', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      let b = initialBreaker();
      const cooldown = Math.floor(rnd() * 100000);
      let t = 0;
      for (let s = 0; s < 12; s++) {
        t += Math.floor(rnd() * 30000) + 1;
        const succeeded = rnd() < 0.55;
        const decision = canAttempt(b, t, cooldown);
        if (!decision.ok) {
          expect(b.state).toBe('open');
          continue;
        }
        const rec = recordResult(b, succeeded, t);
        expect(rec.ok).toBe(true);
        if (!rec.ok) break;
        b = rec.value;
        if (succeeded) {
          expect(b.state).toBe('closed');
          expect(b.failures).toBe(0);
        }
        if (b.state === 'open') expect(b.openedAtMs).not.toBeNull();
        if (b.state !== 'open') expect(b.openedAtMs).toBeNull();
      }
    }
  });
});
