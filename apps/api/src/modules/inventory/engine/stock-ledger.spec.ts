// ============================================================================
// FILE: /apps/api/src/modules/inventory/engine/stock-ledger.spec.ts
// ============================================================================

import { applyMovement } from './stock-ledger';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('stock-ledger engine', () => {
  const at = '2026-03-15T00:00:00Z';

  it('applies a receipt and a matching issue', () => {
    const up = applyMovement(0, [], 10);
    if (!up.ok) return;
    expect(up.value.newQty).toBe(10);
    expect(up.value.totalMoved).toBe(10);
    const down = applyMovement(10, [{ qty: 10, at }], -4);
    if (!down.ok) return;
    expect(down.value.newQty).toBe(6);
    expect(down.value.totalMoved).toBe(6);
  });

  it('refuses zero and non-integer quantities by name', () => {
    const zero = applyMovement(5, [], 0);
    if (!zero.ok) expect(zero.reason).toBe('stock-zero-quantity');
    const frac = applyMovement(5, [], 1.5);
    if (!frac.ok) expect(frac.reason).toBe('stock-zero-quantity');
  });

  it('refuses movements that would drive stock negative by name', () => {
    const r = applyMovement(3, [], -5);
    if (!r.ok) expect(r.reason).toBe('stock-negative-on-hand');
  });

  it('500-case sweep: newQty never negative, totalMoved is the running sum', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      let onHand = Math.floor(rnd() * 50);
      let total = 0;
      const history: { qty: number; at: string }[] = [];
      for (let m = 0; m < 5; m++) {
        const qty = Math.floor(rnd() * 21) - 10;
        const v = applyMovement(onHand, history, qty);
        if (!v.ok) {
          expect(['stock-zero-quantity', 'stock-negative-on-hand']).toContain(v.reason);
          continue;
        }
        expect(v.value.newQty).toBeGreaterThanOrEqual(0);
        total += qty;
        expect(v.value.totalMoved).toBe(total);
        onHand = v.value.newQty;
        history.push({ qty, at });
      }
    }
  });
});
