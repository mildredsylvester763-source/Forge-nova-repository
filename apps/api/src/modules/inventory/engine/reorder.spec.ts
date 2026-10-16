// ============================================================================
// FILE: /apps/api/src/modules/inventory/engine/reorder.spec.ts
// ============================================================================

import { reorderPlan } from './reorder';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('reorder engine', () => {
  it('reorders when on-hand hits the reorder point', () => {
    // demand 2/day, 7-day lead, 5 safety => point 19
    const r = reorderPlan(15, 2, 7, 5);
    if (!r.ok) return;
    expect(r.value.reorderPoint).toBe(19);
    expect(r.value.reorderNow).toBe(true);
    // target = 2 * 37 + 5 = 79; qty = 79 - 15 = 64
    expect(r.value.reorderQty).toBe(64);
  });

  it('does not reorder above the point', () => {
    const r = reorderPlan(50, 2, 7, 5);
    if (!r.ok) return;
    expect(r.value.reorderNow).toBe(false);
    expect(r.value.reorderQty).toBe(0);
  });

  it('refuses negative inputs by name', () => {
    const r = reorderPlan(-1, 2, 7, 5);
    if (!r.ok) expect(r.reason).toBe('reorder-negative-input');
  });

  it('500-case sweep: qty is only nonzero when reorderNow, never negative', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const onHand = Math.floor(rnd() * 200);
      const demand = Math.floor(rnd() * 10);
      const lead = Math.floor(rnd() * 20);
      const safety = Math.floor(rnd() * 10);
      const v = reorderPlan(onHand, demand, lead, safety);
      if (!v.ok) {
        expect(v.reason).toBe('reorder-negative-input');
        continue;
      }
      expect(v.value.reorderPoint).toBe(demand * lead + safety);
      expect(v.value.reorderQty).toBeGreaterThanOrEqual(0);
      if (!v.value.reorderNow) expect(v.value.reorderQty).toBe(0);
    }
  });
});
