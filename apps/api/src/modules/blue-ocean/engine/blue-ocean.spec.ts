// ============================================================================
// FILE: /apps/api/src/modules/blue-ocean/engine/blue-ocean.spec.ts
// ============================================================================
// Pinned verdicts first, then the 500-candidate sweep. Pure and
// deterministic: the same waters always read the same way.

import { rankOceans, readOcean, OceanCandidate, OceanVerdict } from './blue-ocean';

function candidate(partial: Partial<OceanCandidate>): OceanCandidate {
  return {
    id: 'c1', title: 'Notion templates for dentists', demand: 70, competition: 20,
    category: 'templates',
    ...partial,
  };
}

describe('blue ocean engine', () => {
  it('calls high demand with thin competition a blue ocean, quoting its numbers', () => {
    const reading = readOcean(candidate({ demand: 75, competition: 20 }));
    expect(reading.verdict).toBe('blue_ocean');
    expect(reading.gap).toBe(55);
    expect(reading.reasons.join(' ')).toContain('75');
    expect(reading.reasons.join(' ')).toContain('20');
  });

  it('respects the exact blue-ocean boundary (60/35 in, 59/36 out)', () => {
    expect(readOcean(candidate({ demand: 60, competition: 35 })).verdict).toBe('blue_ocean');
    expect(readOcean(candidate({ demand: 59, competition: 20 })).verdict).toBe('open_niche');
    expect(readOcean(candidate({ demand: 70, competition: 36 })).verdict).toBe('open_niche');
  });

  it('reads a big gap with thin demand as an open niche, not a blue ocean', () => {
    const reading = readOcean(candidate({ demand: 45, competition: 10 }));
    expect(reading.verdict).toBe('open_niche');
    expect(reading.reasons.join(' ')).toContain('below the blue-ocean floor');
  });

  it('reads crowded water as red, and near-parities as contested', () => {
    expect(readOcean(candidate({ demand: 20, competition: 60 })).verdict).toBe('red_ocean');
    expect(readOcean(candidate({ demand: 50, competition: 52 })).verdict).toBe('contested');
  });

  it('clamps out-of-range scores instead of trusting them', () => {
    const reading = readOcean(candidate({ demand: 500, competition: -40 }));
    expect(reading.demand).toBe(100);
    expect(reading.competition).toBe(0);
    expect(reading.verdict).toBe('blue_ocean');
  });

  it('ranks biggest gap first, ties alphabetical, and counts verdicts', () => {
    const report = rankOceans([
      candidate({ id: 'a', title: 'Zebra idea', demand: 50, competition: 45 }),
      candidate({ id: 'b', title: 'Aardvark idea', demand: 80, competition: 10 }),
      candidate({ id: 'c', title: 'Mid idea', demand: 30, competition: 50 }),
    ]);
    expect(report.ranked.map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(report.counts.blue_ocean).toBe(1);
    expect(report.counts.contested).toBe(1);
    expect(report.counts.red_ocean).toBe(1);
    expect(report.blueOceanCount).toBe(1);
  });

  it('holds its invariants across a 500-candidate sweep', () => {
    let state = 424242 >>> 0;
    const rand = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    for (let sweep = 0; sweep < 500; sweep++) {
      const pool: OceanCandidate[] = [];
      for (let i = 0; i < 8; i++) {
        pool.push(candidate({
          id: 'c' + sweep + '-' + i,
          title: 'Idea ' + Math.floor(rand() * 5),
          demand: rand() * 130 - 15,
          competition: rand() * 130 - 15,
        }));
      }
      const report = rankOceans(pool);
      expect(report.ranked).toHaveLength(8);
      const total = (Object.values(report.counts) as number[]).reduce((a, b) => a + b, 0);
      expect(total).toBe(8);
      // Ranked by gap, descending, no exceptions.
      for (let i = 1; i < report.ranked.length; i++) {
        expect(report.ranked[i - 1].gap).toBeGreaterThanOrEqual(report.ranked[i].gap);
      }
      // Every verdict carries at least one quoted reason.
      for (const reading of report.ranked) {
        expect(reading.reasons.length).toBeGreaterThan(0);
        expect(reading.demand).toBeGreaterThanOrEqual(0);
        expect(reading.demand).toBeLessThanOrEqual(100);
      }
      // Verdict is always one of the four named waters.
      const valid: OceanVerdict[] = ['blue_ocean', 'open_niche', 'contested', 'red_ocean'];
      for (const reading of report.ranked) {
        expect(valid).toContain(reading.verdict);
      }
    }
  });

  it('is deterministic — same waters, same reading', () => {
    const pool = [candidate({ id: 'x', demand: 65, competition: 30 })];
    expect(rankOceans(pool)).toEqual(rankOceans(pool));
  });
});
