import {
  buildCode,
  validateCode,
  decideReward,
  CODE_ALPHABET,
  CODE_LENGTH,
  REWARD_POINTS,
} from './referral-engine';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('referral engine', () => {
  it('builds deterministic 8-character codes from the safe alphabet', () => {
    const first = buildCode(mulberry32(7));
    const second = buildCode(mulberry32(7));
    expect(first).toBe(second);
    expect(first.length).toBe(CODE_LENGTH);
    expect(CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789');
    for (const c of first.split('')) {
      expect(CODE_ALPHABET.indexOf(c)).toBeGreaterThanOrEqual(0);
    }
  });

  it('never emits characters humans misread', () => {
    for (let seed = 0; seed < 50; seed++) {
      const code = buildCode(mulberry32(seed));
      expect(code).not.toMatch(/[ILO01]/);
    }
  });

  it('accepts trimmed lowercase input and normalizes it', () => {
    const v = validateCode(' ab9ytprh ');
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.code).toBe('AB9YTPRH');
  });

  it('refuses wrong length and bad characters', () => {
    const a = validateCode('AB9YTPRHI');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('referral-invalid-length');
    const b = validateCode('AB9YTPRI');
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('referral-invalid-characters');
    const c = validateCode(42);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('referral-invalid-code');
  });

  it('rewards a bound, unrewarded referral with 500 points', () => {
    const v = decideReward({
      referrerId: 'u1',
      refereeId: 'u2',
      bindingExists: true,
      alreadyRewarded: false,
      purchaseCents: 5000,
    });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.points).toBe(REWARD_POINTS);
    expect(REWARD_POINTS).toBe(500);
  });

  it('refuses self-referrals, unbound pairs, double rewards and bad purchases', () => {
    const base = {
      referrerId: 'u1',
      refereeId: 'u2',
      bindingExists: true,
      alreadyRewarded: false,
      purchaseCents: 5000,
    };
    const self = decideReward({ ...base, refereeId: 'u1' });
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.reason).toBe('referral-self-referral');
    const unbound = decideReward({ ...base, bindingExists: false });
    expect(unbound.ok).toBe(false);
    if (!unbound.ok) expect(unbound.reason).toBe('referral-not-bound');
    const twice = decideReward({ ...base, alreadyRewarded: true });
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.reason).toBe('referral-already-rewarded');
    const bad = decideReward({ ...base, purchaseCents: 0 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('referral-invalid-purchase');
  });

  it('sweeps 500 generated codes and all validate', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const code = buildCode(rng);
      const v = validateCode(code);
      expect(v.ok).toBe(true);
    }
  });
});
