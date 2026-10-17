// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/quota.spec.ts
// ============================================================================
import { TIER_BUDGETS, monthKey, validateTier, consume, projectBurn } from './quota';

describe('quota (egress budgets)', () => {
  it('pins tier budgets', () => {
    expect(TIER_BUDGETS.free).toBe(500);
    expect(TIER_BUDGETS.basic).toBe(5000);
    expect(TIER_BUDGETS.pro).toBe(50000);
  });

  it('derives a month key', () => {
    const v = monthKey('2026-10-17T13:00:00Z');
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.key).toBe('2026-10');
    expect(monthKey('nope').ok).toBe(false);
  });

  it('validates tiers', () => {
    expect(validateTier('pro').ok).toBe(true);
    const v = validateTier('enterprise');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('quota-unknown-tier:enterprise');
  });

  it('consumes up to the exact budget', () => {
    const v = consume('free', 490, 10, '2026-10', '2026-10');
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.used).toBe(500);
      expect(v.value.remaining).toBe(0);
    }
  });

  it('refuses over-budget consumption', () => {
    const v = consume('free', 495, 10, '2026-10', '2026-10');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('quota-exceeded');
  });

  it('refuses stale months and invalid usage', () => {
    const stale = consume('free', 10, 5, '2026-09', '2026-10');
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.reason).toBe('quota-stale-month');
    const neg = consume('free', -1, 5, '2026-10', '2026-10');
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.reason).toBe('quota-invalid-used');
  });

  it('projects burn rate', () => {
    const onPace = projectBurn(300, 1000, 15, 30);
    expect(onPace.ok).toBe(true);
    if (onPace.ok) {
      expect(onPace.value.projected).toBe(600);
      expect(onPace.value.overPace).toBe(false);
    }
    const over = projectBurn(600, 1000, 10, 30);
    expect(over.ok).toBe(true);
    if (over.ok) {
      expect(over.value.projected).toBe(1800);
      expect(over.value.overPace).toBe(true);
    }
  });

  it('refuses invalid elapsed days and month lengths', () => {
    expect(projectBurn(10, 1000, 40, 30).ok).toBe(false);
    expect(projectBurn(10, 1000, 5, 40).ok).toBe(false);
  });

  it('keeps quota arithmetic consistent across a sweep', () => {
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
      const tier = (['free', 'basic', 'pro'] as const)[Math.floor(rnd() * 3)];
      const used = Math.floor(rnd() * 60000);
      const units = 1 + Math.floor(rnd() * 500);
      const v = consume(tier, used, units, '2026-10', '2026-10');
      if (v.ok) {
        expect(v.value.remaining).toBeGreaterThanOrEqual(0);
        expect(v.value.remaining).toBe(v.value.budget - v.value.used);
      } else {
        expect(['quota-exceeded', 'quota-invalid-used']).toContain(v.reason);
      }
    }
  });
});
