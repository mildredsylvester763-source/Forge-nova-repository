import {
  marginSnapshot,
  validateCostQty,
  validateSellPriceCents,
  validateUnitCostCents,
  weightedAverageCost,
} from './costing-engine';

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

// The sweep oracle uses pure integer arithmetic: rounding half-up of num/den
// is floor((2*num + den) / (2*den)), an independent path from Math.round.
// Adding 0 normalises a possible negative zero from Math.round.

describe('costing-engine (pinned vectors)', () => {
  it('validates quantities and money by name, with vectors at the caps', () => {
    expect(validateCostQty(1)).toEqual({ ok: true, value: 1 });
    expect(validateCostQty(0)).toEqual({ ok: false, reason: 'cost-invalid-qty' });
    expect(validateCostQty(1.5)).toEqual({ ok: false, reason: 'cost-invalid-qty' });
    expect(validateCostQty('7')).toEqual({ ok: false, reason: 'cost-invalid-qty' });
    expect(validateCostQty(10000000)).toEqual({ ok: true, value: 10000000 });
    expect(validateCostQty(10000001)).toEqual({ ok: false, reason: 'cost-qty-too-large' });
    expect(validateUnitCostCents(100000000)).toEqual({ ok: true, value: 100000000 });
    expect(validateUnitCostCents(100000001)).toEqual({ ok: false, reason: 'cost-unit-cost-too-large' });
    expect(validateUnitCostCents(0)).toEqual({ ok: false, reason: 'cost-invalid-unit-cost' });
    expect(validateSellPriceCents(100000000)).toEqual({ ok: true, value: 100000000 });
    expect(validateSellPriceCents(0)).toEqual({ ok: false, reason: 'cost-invalid-sell-price' });
  });

  it('computes weighted average cost exactly', () => {
    expect(weightedAverageCost(0, 0, 10, 200)).toEqual({ ok: true, value: 200 });
    expect(weightedAverageCost(10, 200, 30, 100)).toEqual({ ok: true, value: 125 });
    expect(weightedAverageCost(4, 300, 6, 600)).toEqual({ ok: true, value: 480 });
    expect(weightedAverageCost(1, 100, 2, 101)).toEqual({ ok: true, value: 101 });
  });

  it('refuses bad or over-cap receipts by name', () => {
    expect(weightedAverageCost(10, 200, 0, 100)).toEqual({ ok: false, reason: 'cost-invalid-receipt' });
    expect(weightedAverageCost(10, 200, 5, 0)).toEqual({ ok: false, reason: 'cost-invalid-receipt' });
    expect(weightedAverageCost(9999999, 500, 1, 500)).toEqual({ ok: true, value: 500 });
    expect(weightedAverageCost(10000000, 500, 1, 500)).toEqual({ ok: false, reason: 'cost-qty-too-large' });
  });

  it('computes honest margins or returns null', () => {
    expect(marginSnapshot(null, 250)).toBeNull();
    expect(marginSnapshot(500, null)).toBeNull();
    expect(marginSnapshot(500, 250)).toEqual({
      sellPriceCents: 500,
      avgCostCents: 250,
      profitCents: 250,
      marginPct: 50,
      markupPct: 100,
    });
    expect(marginSnapshot(250, 500)).toEqual({
      sellPriceCents: 250,
      avgCostCents: 500,
      profitCents: -250,
      marginPct: -100,
      markupPct: -50,
    });
    expect(marginSnapshot(299, 200)).toEqual({
      sellPriceCents: 299,
      avgCostCents: 200,
      profitCents: 99,
      marginPct: 33.11,
      markupPct: 49.5,
    });
    expect(marginSnapshot(200, 0)).toEqual({
      sellPriceCents: 200,
      avgCostCents: 0,
      profitCents: 200,
      marginPct: 100,
      markupPct: null,
    });
  });
});

describe('costing-engine (500-case sweep, seed 42)', () => {
  it('weighted averages match an integer-arithmetic oracle', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const prevQty = Math.floor(rng() * 5000);
      const prevAvg = Math.floor(rng() * 2000) + 1;
      const recvQty = Math.floor(rng() * 5000) + 1;
      const recvCost = Math.floor(rng() * 2000) + 1;
      const verdict = weightedAverageCost(prevQty, prevAvg, recvQty, recvCost);
      if (!verdict.ok) {
        throw new Error('expected a computed average');
      }
      const total = prevQty * prevAvg + recvQty * recvCost;
      const newQty = prevQty + recvQty;
      const expected = Math.floor((2 * total + newQty) / (2 * newQty));
      expect(verdict.value).toBe(expected);
    }
  });

  it('margin snapshots match an integer-arithmetic oracle', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const price = Math.floor(rng() * 100000) + 1;
      const cost = Math.floor(rng() * 100000);
      const snap = marginSnapshot(price, cost);
      if (!snap) {
        throw new Error('expected a margin snapshot');
      }
      const profit = price - cost;
      const expectedMargin = Math.floor((2 * profit * 10000 + price) / (2 * price)) / 100;
      const expectedMarkup = cost === 0 ? null : Math.floor((2 * profit * 10000 + cost) / (2 * cost)) / 100;
      expect(snap.profitCents).toBe(profit);
      expect(snap.marginPct + 0).toBe(expectedMargin);
      expect(snap.markupPct === null ? null : snap.markupPct + 0).toBe(expectedMarkup);
    }
  });
});
