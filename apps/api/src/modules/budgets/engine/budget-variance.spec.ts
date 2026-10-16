// ============================================================================
// FILE: /apps/api/src/modules/budgets/engine/budget-variance.spec.ts
// ============================================================================

import { budgetVariance } from './budget-variance';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('budget-variance engine', () => {
  it('computes the pinned under-budget variance', () => {
    const r = budgetVariance(100000, 75000);
    if (!r.ok) return;
    expect(r.value.varianceCents).toBe(25000);
    expect(r.value.variancePct).toBe(25);
    expect(r.value.status).toBe('under');
  });

  it('flags overspend as negative variance', () => {
    const r = budgetVariance(100000, 130000);
    if (!r.ok) return;
    expect(r.value.varianceCents).toBe(-30000);
    expect(r.value.status).toBe('over');
  });

  it('refuses negative budget, negative actual, and zero-budget-with-spend by name', () => {
    const negBudget = budgetVariance(-1, 0);
    expect(negBudget.ok).toBe(false);
    if (!negBudget.ok) expect(negBudget.reason).toBe('budget-negative-amount');
    const negActual = budgetVariance(100, -1);
    expect(negActual.ok).toBe(false);
    if (!negActual.ok) expect(negActual.reason).toBe('actual-negative-amount');
    const zero = budgetVariance(0, 500);
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.reason).toBe('budget-zero-division');
  });

  it('500-case sweep: variance equals budget minus actual, status always coherent', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const budget = Math.floor(rnd() * 200000);
      const actual = rnd() < 0.1 && budget === 0 ? 0 : Math.floor(rnd() * 200000);
      const v = budgetVariance(budget, actual);
      if (!v.ok) {
        expect(['budget-negative-amount', 'actual-negative-amount', 'budget-zero-division']).toContain(v.reason);
        continue;
      }
      expect(v.value.varianceCents).toBe(budget - actual);
      const sign = budget - actual;
      expect(v.value.status).toBe(sign > 0 ? 'under' : sign < 0 ? 'over' : 'on');
    }
  });
});
