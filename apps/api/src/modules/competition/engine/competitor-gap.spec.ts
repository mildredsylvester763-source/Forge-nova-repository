import { analyzeCompetitorGap, buildScanReport, CompetitorInput } from './competitor-gap';

const C = (over: Partial<CompetitorInput>): CompetitorInput => ({
  name: 'comp', ...over,
});

describe('analyzeCompetitorGap pinned vectors', () => {
  it('an empty niche is wide open — with an honest warning, not fake confidence', () => {
    const r = analyzeCompetitorGap({ price: 10, features: [] }, []);
    expect(r.verdict).toBe('wide_open');
    expect(r.competitorCount).toBe(0);
    expect(r.warnings.some(w => w.includes('uncharted'))).toBe(true);
  });

  it('three competitors make the niche contested, and the majority feature is a gap', () => {
    const r = analyzeCompetitorGap(
      { price: 18, features: ['handmade'] },
      [
        C({ name: 'a', price: 10, features: ['fast-shipping', 'warranty'] }),
        C({ name: 'b', price: 20, features: ['warranty'] }),
        C({ name: 'c', price: 30, features: ['warranty', 'fast-shipping'] }),
      ],
    );
    expect(r.verdict).toBe('contested');
    expect(r.priceBand).toEqual({ min: 10, median: 20, max: 30 });
    expect(r.pricePositionPercentile).toBe(33);
    expect(r.pricePositionNote).toContain('below the band median');
    // threshold = ceil(3 * 0.5) = 2 — warranty (3/3) and fast-shipping (2/3) are both gaps.
    expect(r.featureGaps.map(g => g.feature)).toEqual(['warranty', 'fast-shipping']);
    expect(r.advantages.length).toBeGreaterThan(0);
  });

  it('eight-plus competitors is saturated at 100', () => {
    const r = analyzeCompetitorGap({ price: 10 }, Array.from({ length: 9 }, (_, i) => C({ name: 'c' + i, price: 10 })));
    expect(r.verdict).toBe('saturated');
    expect(r.saturationScore).toBe(100);
  });

  it('an even price band takes the true median, not an upper element', () => {
    const r = analyzeCompetitorGap(
      { price: 25 },
      [C({ name: 'a', price: 10 }), C({ name: 'b', price: 20 }), C({ name: 'c', price: 30 }), C({ name: 'd', price: 40 })],
    );
    expect(r.priceBand!.median).toBe(25);
  });

  it('competitors with unreadable prices count for the crowd but not the band', () => {
    const r = analyzeCompetitorGap(
      { price: 10 },
      [C({ name: 'a' }), C({ name: 'b', price: 'n/a' as any }), C({ name: 'c', price: 20 })],
    );
    expect(r.competitorCount).toBe(3);
    expect(r.priceBand!.min).toBe(20);
    expect(r.priceBand!.max).toBe(20);
  });

  it('buildScanReport speaks in sentences a human can forward', () => {
    const rep = buildScanReport(
      { name: 'Widget', price: 18, features: ['handmade'] },
      [C({ name: 'a', price: 10, features: ['warranty'] }), C({ name: 'b', price: 20, features: ['warranty'] })],
    );
    expect(rep.headline).toContain('Widget');
    expect(rep.headline).toContain('contested');
    expect(rep.gaps).toContain('warranty');
    expect(rep.edge).toContain('handmade');
  });
});

describe('analyzeCompetitorGap invariants', () => {
  function mulberry32(seed: number) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(70707);
  const names = ['warranty', 'fast-shipping', 'handmade', 'bulk-discount', 'gift-wrap', 'support'];

  it('stays bounded and consistent across 300 seeded niches', () => {
    for (let i = 0; i < 300; i++) {
      const comps = Array.from({ length: Math.floor(rand() * 12) }, () => C({
        name: 'c' + rand().toFixed(4),
        price: Math.round(rand() * 100) || null,
        features: names.filter(() => rand() > 0.5),
      }));
      const me = { price: Math.round(rand() * 120), features: names.filter(() => rand() > 0.6) };
      const r = analyzeCompetitorGap(me, comps);
      expect(r.saturationScore).toBeGreaterThanOrEqual(0);
      expect(r.saturationScore).toBeLessThanOrEqual(100);
      expect(r.competitorCount).toBeLessThanOrEqual(comps.length);
      if (r.priceBand) expect(r.priceBand.min).toBeLessThanOrEqual(r.priceBand.median + 1e-9);
      expect(analyzeCompetitorGap(me, comps)).toEqual(r); // deterministic
    }
  });
});
