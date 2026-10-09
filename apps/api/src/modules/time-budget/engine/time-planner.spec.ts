import { planTime, TimeRequest } from './time-planner';

const R = (over: Partial<TimeRequest>): TimeRequest => ({
  ref: 'r', label: 'Request', requestedHours: 5, priority: 'normal', ...over,
});

describe('planTime pinned vectors', () => {
  it('grants everything when capacity fits, and reports the leftover', () => {
    const plan = planTime(20, [R({ ref: 'a', requestedHours: 8 }), R({ ref: 'b', requestedHours: 7 })]);
    expect(plan.overcommitted).toBe(false);
    expect(plan.totalGranted).toBe(15);
    expect(plan.leftoverHours).toBe(5);
    expect(plan.warnings).toHaveLength(0);
  });

  it('beats first-come-first-served: a critical request arriving last still wins its hours first', () => {
    const plan = planTime(10, [
      R({ ref: 'low-early', label: 'Low early', requestedHours: 10, priority: 'low' }),
      R({ ref: 'crit-late', label: 'Critical late', requestedHours: 8, priority: 'critical' }),
    ]);
    const byRef = Object.fromEntries(plan.allocations.map(a => [a.ref, a.grantedHours]));
    // Weights 1 vs 4 over 10h: crit gets min(8, 8)=8, low gets the reflow 2.
    expect(byRef['crit-late']).toBe(8);
    expect(byRef['low-early']).toBe(2);
    expect(plan.overcommitted).toBe(true);
  });

  it('proportional when nothing is satisfied: weights decide the split', () => {
    const plan = planTime(14, [
      R({ ref: 'c', requestedHours: 20, priority: 'critical' }), // weight 4
      R({ ref: 'n', requestedHours: 20, priority: 'normal' }),    // weight 2
    ]);
    const byRef = Object.fromEntries(plan.allocations.map(a => [a.ref, a.grantedHours]));
    expect(byRef.c).toBeCloseTo(9.33, 1); // 14 × 4/6
    expect(byRef.n).toBeCloseTo(4.67, 1); // 14 × 2/6
  });

  it('names every deficit in the warnings', () => {
    const plan = planTime(5, [R({ ref: 'a', label: 'Alpha', requestedHours: 9, priority: 'high' })]);
    expect(plan.warnings[0]).toContain('Overcommitted by 4');
    expect(plan.warnings.some(w => w.includes('Alpha') && w.includes('loses 4h'))).toBe(true);
  });

  it('reflows surplus from a satisfied request to a deficient one', () => {
    const plan = planTime(12, [
      R({ ref: 'small', label: 'Small', requestedHours: 2, priority: 'critical' }),
      R({ ref: 'big', label: 'Big', requestedHours: 20, priority: 'high' }),
    ]);
    const byRef = Object.fromEntries(plan.allocations.map(a => [a.ref, a.grantedHours]));
    expect(byRef.small).toBe(2); // satisfied
    expect(byRef.big).toBe(10);   // got everything that was left
  });

  it('deduplicates by ref — the later ask wins and the collision is surfaced', () => {
    const plan = planTime(30, [
      R({ ref: 'a', label: 'First ask', requestedHours: 10 }),
      R({ ref: 'a', label: 'Second ask', requestedHours: 4 }),
    ]);
    expect(plan.allocations).toHaveLength(1);
    expect(plan.allocations[0].requestedHours).toBe(4);
    expect(plan.warnings.some(w => w.includes('Duplicate ref a'))).toBe(true);
  });

  it('ignores invalid requests and says so', () => {
    const plan = planTime(10, [R({ ref: '', requestedHours: 5 }), R({ ref: 'b', requestedHours: -3 }), R({ ref: 'ok', requestedHours: 4 })]);
    expect(plan.allocations).toHaveLength(1);
    expect(plan.allocations[0].ref).toBe('ok');
    expect(plan.warnings.some(w => w.includes('invalid request'))).toBe(true);
  });

  it('zero capacity grants nothing and warns about overcommitment', () => {
    const plan = planTime(0, [R({ ref: 'a', requestedHours: 3 })]);
    expect(plan.totalGranted).toBe(0);
    expect(plan.overcommitted).toBe(true);
  });
});

describe('planTime invariants', () => {
  function mulberry32(seed: number) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(464646);
  const priorities = ['critical', 'high', 'normal', 'low'] as const;

  it('never grants more than capacity, never more than asked (500 seeded plans)', () => {
    for (let i = 0; i < 500; i++) {
      const capacity = Math.floor(rand() * 60);
      const requests: TimeRequest[] = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, j) => R({
        ref: 'r' + j,
        label: 'R' + j,
        requestedHours: 1 + Math.floor(rand() * 24), // 1..24 — a zero-hour ask is an invalid request, not a plan
        priority: priorities[Math.floor(rand() * 4)],
      }));
      const plan = planTime(capacity, requests);
      expect(plan.totalGranted).toBeLessThanOrEqual(capacity + 0.01);
      for (const a of plan.allocations) {
        expect(a.grantedHours).toBeGreaterThanOrEqual(0);
        expect(a.grantedHours).toBeLessThanOrEqual(a.requestedHours + 0.01);
      }
      expect(plan.totalRequested).toBeGreaterThan(0);
    }
  });

  it('is deterministic', () => {
    const requests = [R({ ref: 'a', requestedHours: 9, priority: 'critical' }), R({ ref: 'b', requestedHours: 4 })];
    expect(planTime(8, requests)).toEqual(planTime(8, requests));
  });
});
