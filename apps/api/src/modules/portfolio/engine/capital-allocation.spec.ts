import { allocateCapital, AllocationCandidate } from './capital-allocation';

const C = (over: Partial<AllocationCandidate>): AllocationCandidate => ({
  id: 'c', name: 'Product', verdict: 'HOLD', confidence: 50, ...over,
});

describe('allocateCapital pinned vectors', () => {
  it('weights follow the verdict policy: SCALE full confidence, PIVOT 0.4x, KILL/HOLD zero', () => {
    const plan = allocateCapital(1000, [
      C({ id: 's', name: 'S', verdict: 'SCALE', confidence: 80 }),
      C({ id: 'p', name: 'P', verdict: 'PIVOT', confidence: 80 }),
      C({ id: 'k', name: 'K', verdict: 'KILL', confidence: 90 }),
      C({ id: 'h', name: 'H', verdict: 'HOLD', confidence: 90 }),
    ]);
    const byId = Object.fromEntries(plan.allocations.map(a => [a.id, a.amount]));
    // Weights 0.8 vs 0.8×0.4=0.32, total 1.12 → 714.29 vs 285.71.
    expect(byId.s).toBeCloseTo(714.29, 1);
    expect(byId.p).toBeCloseTo(285.71, 1);
    expect(byId.k).toBe(0);
    expect(byId.h).toBe(0);
    expect(plan.allocations.find(a => a.id === 'k')!.reasons[0]).toContain('KILL');
  });

  it('splits equally between equal candidates — no favorites', () => {
    const plan = allocateCapital(1000, [
      C({ id: 'a', verdict: 'SCALE', confidence: 60 }),
      C({ id: 'b', verdict: 'SCALE', confidence: 60 }),
    ]);
    const byId = Object.fromEntries(plan.allocations.map(a => [a.id, a.amount]));
    expect(byId.a).toBe(500);
    expect(byId.b).toBe(500);
  });

  it('enforces the single-candidate cap and routes overflow to the other candidate', () => {
    const plan = allocateCapital(1000, [
      C({ id: 'strong', verdict: 'SCALE', confidence: 95 }),
      C({ id: 'weak', verdict: 'PIVOT', confidence: 20 }),
    ], { maxSharePerCandidate: 0.6 });
    const byId = Object.fromEntries(plan.allocations.map(a => [a.id, a.amount]));
    expect(byId.strong).toBe(600); // capped at 60%
    expect(byId.weak).toBe(400);   // overflow reflows
    expect(plan.reserve).toBe(0);
    expect(plan.allocations.find(a => a.id === 'strong')!.reasons.some(r => r.includes('Capped'))).toBe(true);
  });

  it('reserves everything when nothing earned capital', () => {
    const plan = allocateCapital(500, [C({ verdict: 'HOLD' }), C({ verdict: 'KILL' })]);
    expect(plan.allocated).toBe(0);
    expect(plan.reserve).toBe(500);
    expect(plan.warnings.some(w => w.includes('reserve'))).toBe(true);
  });

  it('handles a zero budget without dividing by zero', () => {
    const plan = allocateCapital(0, [C({ verdict: 'SCALE', confidence: 90 })]);
    expect(plan.reserve).toBe(0);
    expect(plan.warnings[0]).toContain('zero');
  });

  it('caps ALL candidates when everyone is huge — the rest becomes reserve, never over-allocation', () => {
    const plan = allocateCapital(100, [
      C({ id: 'a', verdict: 'SCALE', confidence: 90 }),
      C({ id: 'b', verdict: 'SCALE', confidence: 90 }),
      C({ id: 'c', verdict: 'SCALE', confidence: 90 }),
    ], { maxSharePerCandidate: 0.3 });
    expect(plan.allocated).toBeCloseTo(90, 1); // 3 × 30
    expect(plan.reserve).toBeCloseTo(10, 1);
  });
});

describe('allocateCapital invariants', () => {
  function mulberry32(seed: number) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(555555);
  const verdicts = ['KILL', 'SCALE', 'PIVOT', 'HOLD'] as const;

  it('allocations + reserve always equal the budget, and no candidate exceeds its cap (500 seeded plans)', () => {
    for (let i = 0; i < 500; i++) {
      const budget = Math.floor(rand() * 10000);
      const maxShare = 0.2 + rand() * 0.6;
      const candidates: AllocationCandidate[] = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, j) => C({
        id: 'c' + j,
        name: 'C' + j,
        verdict: verdicts[Math.floor(rand() * 4)],
        confidence: Math.floor(rand() * 101),
      }));
      const plan = allocateCapital(budget, candidates, { maxSharePerCandidate: maxShare });
      const sum = plan.allocations.reduce((a, x) => a + x.amount, 0) + plan.reserve;
      expect(Math.abs(sum - plan.budget)).toBeLessThanOrEqual(0.01);
      for (const a of plan.allocations) {
        expect(a.amount).toBeGreaterThanOrEqual(0);
        expect(a.amount).toBeLessThanOrEqual(budget * maxShare + 0.01);
      }
    }
  });

  it('KILL and HOLD never receive capital in any plan', () => {
    for (let i = 0; i < 200; i++) {
      const candidates: AllocationCandidate[] = Array.from({ length: 4 }, (_, j) => C({
        id: 'c' + j, name: 'C' + j,
        verdict: verdicts[Math.floor(rand() * 4)],
        confidence: Math.floor(rand() * 101),
      }));
      const plan = allocateCapital(1000, candidates);
      for (const a of plan.allocations) {
        if (a.verdict === 'KILL' || a.verdict === 'HOLD') expect(a.amount).toBe(0);
      }
    }
  });

  it('is deterministic', () => {
    const candidates = [C({ id: 'a', verdict: 'SCALE', confidence: 70 }), C({ id: 'b', verdict: 'PIVOT', confidence: 40 })];
    expect(allocateCapital(999, candidates)).toEqual(allocateCapital(999, candidates));
  });
});
