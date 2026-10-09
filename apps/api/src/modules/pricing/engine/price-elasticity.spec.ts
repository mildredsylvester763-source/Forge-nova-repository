import { estimateElasticity, PriceObservation } from './price-elasticity';

const O = (over: Partial<PriceObservation>): PriceObservation => ({
  beforePrice: 10, afterPrice: 10, unitsBefore: 100, unitsAfter: 100, ...over,
});

describe('estimateElasticity pinned vectors', () => {
  it('a 10→12 raise costing 10 units is inelastic (E = -0.58)', () => {
    const r = estimateElasticity([O({ afterPrice: 12, unitsAfter: 90 })], { price: 10, unitsPerPeriod: 100 });
    expect(r.elasticity).toBeCloseTo(-0.58, 2);
    expect(r.classification).toBe('inelastic');
  });

  it('inelastic demand suggests the top of the +/-20% band (revenue-max)', () => {
    const r = estimateElasticity([O({ afterPrice: 12, unitsAfter: 90 })], { price: 10, unitsPerPeriod: 100 });
    expect(r.suggestedPrice).toBe(12);
    expect(r.projectedRevenueAtSuggestion!).toBeGreaterThan(r.projectedRevenueAtCurrent!);
  });

  it('a halving of units on a 10% raise is highly elastic (E = -7)', () => {
    const r = estimateElasticity([O({ afterPrice: 11, unitsAfter: 50 })], { price: 10, unitsPerPeriod: 100 });
    expect(r.elasticity).toBeCloseTo(-7, 1);
    expect(r.classification).toBe('elastic');
    // Elastic demand: the sweep finds revenue at the BOTTOM of the band.
    expect(r.suggestedPrice).toBe(8);
  });

  it('a sub-5% wiggle is excluded as unreadable, with a warning', () => {
    const r = estimateElasticity([O({ afterPrice: 10.2, unitsAfter: 99 })], { price: 10, unitsPerPeriod: 100 });
    expect(r.rejectedObservations).toBe(1);
    expect(r.classification).toBe('unknown');
    expect(r.suggestedPrice).toBeNull();
    expect(r.warnings.some(w => w.includes('excluded'))).toBe(true);
  });

  it('no observations at all = an honest refusal, never a fake number', () => {
    const r = estimateElasticity([], { price: 10, unitsPerPeriod: 100 });
    expect(r.classification).toBe('unknown');
    expect(r.suggestedPrice).toBeNull();
    expect(r.verdict).toContain('Not enough');
    expect(r.alerts).toHaveLength(0);
  });

  it('with a known cost, the sweep optimizes contribution and never suggests below cost', () => {
    const r = estimateElasticity([O({ afterPrice: 11, unitsAfter: 50 })], { price: 10, unitsPerPeriod: 100, costPerUnit: 9 });
    expect(r.suggestedPrice!).toBeGreaterThanOrEqual(9);
    expect(r.alerts.some(a => a.includes('contribution'))).toBe(true);
  });

  it('three agreeing observations earn high confidence', () => {
    const obs = [
      O({ afterPrice: 12, unitsAfter: 92 }),
      O({ beforePrice: 12, afterPrice: 14, unitsBefore: 92, unitsAfter: 85 }),
      O({ beforePrice: 14, afterPrice: 16, unitsBefore: 85, unitsAfter: 79 }),
    ];
    const r = estimateElasticity(obs, { price: 16, unitsPerPeriod: 79 });
    expect(r.usableObservations).toBe(3);
    expect(r.confidence).toBe('high');
    expect(r.alerts.some(a => a.includes('inelastic'))).toBe(true);
  });
});

describe('estimateElasticity invariants', () => {
  function mulberry32(seed: number) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(80808);

  it('suggestions always land inside the +/-20% band (300 seeded sets)', () => {
    for (let i = 0; i < 300; i++) {
      const price = 1 + Math.round(rand() * 100);
      const obs = Array.from({ length: Math.floor(rand() * 5) }, () => O({
        beforePrice: price,
        afterPrice: Math.round(price * (0.85 + rand() * 0.3) * 100) / 100,
        unitsBefore: 50,
        unitsAfter: Math.round(50 * (0.5 + rand())),
      }));
      const r = estimateElasticity(obs, { price, unitsPerPeriod: 50 });
      if (r.suggestedPrice != null) {
        expect(r.suggestedPrice).toBeGreaterThanOrEqual(price * 0.8 - 0.02);
        expect(r.suggestedPrice).toBeLessThanOrEqual(price * 1.2 + 0.02);
      }
      if (r.projectedRevenueAtCurrent != null) {
        expect(r.projectedRevenueAtCurrent).toBeGreaterThanOrEqual(0);
      }
      expect(estimateElasticity(obs, { price, unitsPerPeriod: 50 })).toEqual(r);
    }
  });
});
