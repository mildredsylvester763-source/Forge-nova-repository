import {
  decideCharge,
  decideLimitChange,
  decideRelease,
  MAX_CREDIT_CENTS,
  validateLimit,
  validateReason,
} from './credit-limits-engine';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('credit-limits-engine (pinned vectors)', () => {
  it('accepts a normal limit and refuses negatives, fractions and oversized limits', () => {
    expect(validateLimit(5000)).toEqual({ ok: true, value: 5000 });
    expect(validateLimit(-1)).toEqual({ ok: false, reason: 'credit-invalid-limit' });
    expect(validateLimit(1.5)).toEqual({ ok: false, reason: 'credit-invalid-limit' });
    expect(validateLimit(MAX_CREDIT_CENTS + 1)).toEqual({
      ok: false,
      reason: 'credit-limit-too-large',
    });
  });

  it('approves a charge that fits and reports the new balance exactly', () => {
    const verdict = decideCharge({ limitCents: 10000, usedCents: 2500, chargeCents: 3000 });
    expect(verdict).toEqual({
      ok: true,
      value: { remainingCents: 4500, usedAfterCents: 5500 },
    });
  });

  it('approves a charge that exactly exhausts the limit', () => {
    const verdict = decideCharge({ limitCents: 10000, usedCents: 2500, chargeCents: 7500 });
    expect(verdict).toEqual({
      ok: true,
      value: { remainingCents: 0, usedAfterCents: 10000 },
    });
  });

  it('refuses a charge that would exceed the limit', () => {
    const verdict = decideCharge({ limitCents: 10000, usedCents: 2500, chargeCents: 8000 });
    expect(verdict).toEqual({ ok: false, reason: 'credit-charge-exceeds-limit' });
  });

  it('refuses zero and negative charges with a distinct reason', () => {
    expect(decideCharge({ limitCents: 10000, usedCents: 0, chargeCents: 0 })).toEqual({
      ok: false,
      reason: 'credit-invalid-charge',
    });
    expect(decideCharge({ limitCents: 10000, usedCents: 0, chargeCents: -5 })).toEqual({
      ok: false,
      reason: 'credit-invalid-charge',
    });
  });

  it('releases credit up to the used amount and refuses more than used', () => {
    expect(decideRelease({ usedCents: 2500, releaseCents: 1000 })).toEqual({
      ok: true,
      value: { usedAfterCents: 1500 },
    });
    expect(decideRelease({ usedCents: 2500, releaseCents: 3000 })).toEqual({
      ok: false,
      reason: 'credit-release-exceeds-used',
    });
  });

  it('allows lowering a limit but not below what is already used', () => {
    expect(
      decideLimitChange({ currentLimitCents: 10000, usedCents: 2500, newLimitCents: 3000 }),
    ).toEqual({ ok: true, value: { limitAfterCents: 3000 } });
    expect(
      decideLimitChange({ currentLimitCents: 10000, usedCents: 2500, newLimitCents: 2000 }),
    ).toEqual({ ok: false, reason: 'credit-limit-below-used' });
  });

  it('validates reasons: blank is refused, long is refused, normal passes', () => {
    expect(validateReason('invoice 12')).toEqual({ ok: true, value: 'invoice 12' });
    expect(validateReason('   ')).toEqual({ ok: false, reason: 'credit-invalid-reason' });
    expect(validateReason('x'.repeat(201))).toEqual({
      ok: false,
      reason: 'credit-reason-too-long',
    });
  });
});

describe('credit-limits-engine (500-case sweep, seed 42)', () => {
  it('never contradicts itself for any random limit/used/charge triple', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const limit = Math.floor(rng() * 30000);
      const used = Math.floor(rng() * 30000);
      const charge = Math.floor(rng() * 30000);
      const verdict = decideCharge({ limitCents: limit, usedCents: used, chargeCents: charge });
      if (charge <= 0) {
        expect(verdict).toEqual({ ok: false, reason: 'credit-invalid-charge' });
        continue;
      }
      if (!verdict.ok) {
        expect(['credit-charge-exceeds-limit', 'credit-used-exceeds-limit']).toContain(
          verdict.reason,
        );
        continue;
      }
      expect(verdict.value.usedAfterCents).toBe(used + charge);
      expect(verdict.value.remainingCents).toBe(limit - used - charge);
    }
  });

  it('releases are always consistent with the used amount', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const used = Math.floor(rng() * 20000);
      const release = Math.floor(rng() * 20000);
      const verdict = decideRelease({ usedCents: used, releaseCents: release });
      if (release <= 0) {
        expect(verdict).toEqual({ ok: false, reason: 'credit-invalid-release' });
      } else if (release > used) {
        expect(verdict).toEqual({ ok: false, reason: 'credit-release-exceeds-used' });
      } else {
        if (!verdict.ok) throw new Error('expected release to succeed');
        expect(verdict.value.usedAfterCents).toBe(used - release);
      }
    }
  });
});
