// ============================================================================
// FILE: /apps/api/src/modules/geo/engine/geo-heat.spec.ts
// ============================================================================
// Pinned behaviour first, then a 500-vector sweep that must hold no matter
// what the scanners dump in. The engine is pure: same input, same map.

import { buildHeatmap, clampStrength, tierFor, GeoSignal } from './geo-heat';

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('geo heat engine', () => {
  it('returns an empty map for zero signals', () => {
    const map = buildHeatmap([]);
    expect(map.regions).toEqual([]);
    expect(map.totalSignals).toBe(0);
    expect(map.unparsedCount).toBe(0);
  });

  it('averages multiple signals for one region instead of taking the loudest', () => {
    const map = buildHeatmap([
      { region: 'US', strength: 90, source: 'opp-a' },
      { region: 'US', strength: 30, source: 'opp-b' },
    ]);
    expect(map.regions).toHaveLength(1);
    expect(map.regions[0].heat).toBe(60);
    expect(map.regions[0].sampleCount).toBe(2);
    expect(map.regions[0].tier).toBe('hot');
  });

  it('sorts hottest first and breaks ties alphabetically', () => {
    const map = buildHeatmap([
      { region: 'Brazil', strength: 50, source: 'a' },
      { region: 'Argentina', strength: 50, source: 'b' },
      { region: 'US', strength: 80, source: 'c' },
    ]);
    expect(map.regions.map((r) => r.region)).toEqual(['US', 'Argentina', 'Brazil']);
  });

  it('clamps out-of-range strengths instead of trusting them', () => {
    expect(clampStrength(150)).toBe(100);
    expect(clampStrength(-20)).toBe(0);
    expect(clampStrength(Number.NaN)).toBe(0);
    expect(tierFor(59.99)).toBe('warm');
    expect(tierFor(60)).toBe('hot');
    expect(tierFor(34.9)).toBe('cold');
  });

  it('ignores blank region names rather than filing them under emptiness', () => {
    const map = buildHeatmap([
      { region: '   ', strength: 99, source: 'a' },
      { region: 'US', strength: 40, source: 'b' },
    ]);
    expect(map.regions).toHaveLength(1);
    expect(map.totalSignals).toBe(2);
  });

  it('carries the unparsed count through untouched', () => {
    const map = buildHeatmap([], 7);
    expect(map.unparsedCount).toBe(7);
  });

  it('holds its invariants across a 500-signal sweep', () => {
    const rand = seeded(20261009);
    for (let sweep = 0; sweep < 500; sweep++) {
      const signals: GeoSignal[] = [];
      const count = 1 + Math.floor(rand() * 25);
      for (let i = 0; i < count; i++) {
        signals.push({
          region: 'R' + Math.floor(rand() * 8),
          strength: rand() * 120 - 10,
          source: 'opp-' + i,
        });
      }
      const map = buildHeatmap(signals);
      expect(map.totalSignals).toBe(signals.length);
      // Every region heat is an average of clamped values, so 0..100.
      for (const region of map.regions) {
        expect(region.heat).toBeGreaterThanOrEqual(0);
        expect(region.heat).toBeLessThanOrEqual(100);
        expect(region.sampleCount).toBeGreaterThan(0);
        if (region.tier === 'hot') expect(region.heat).toBeGreaterThanOrEqual(60);
        if (region.tier === 'warm') expect(region.heat).toBeGreaterThanOrEqual(35);
      }
      // Sorted hottest first, no exceptions.
      for (let i = 1; i < map.regions.length; i++) {
        expect(map.regions[i - 1].heat).toBeGreaterThanOrEqual(map.regions[i].heat);
      }
    }
  });

  it('is deterministic — the same input renders the same map twice', () => {
    const signals: GeoSignal[] = [
      { region: 'US', strength: 70, source: 'a' },
      { region: 'US', strength: 50, source: 'b' },
      { region: 'UK', strength: 65, source: 'c' },
    ];
    expect(buildHeatmap(signals)).toEqual(buildHeatmap(signals));
  });
});
