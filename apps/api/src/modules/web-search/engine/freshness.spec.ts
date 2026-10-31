import { freshnessBand } from './freshness';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = new Date('2026-10-31T00:00:00.000Z');

describe('freshness engine (FORGE AI-060)', () => {
  it('missing dates are unknown, never faked', () => {
    expect(freshnessBand(null, NOW)).toEqual({ ok: true, band: 'unknown', ageDays: null });
    expect(freshnessBand(undefined, NOW)).toEqual({ ok: true, band: 'unknown', ageDays: null });
    expect(freshnessBand('', NOW)).toEqual({ ok: true, band: 'unknown', ageDays: null });
  });

  it('bands are pinned at the exact boundaries', () => {
    const freshEdge = freshnessBand('2026-10-01', NOW);
    if (!freshEdge.ok) throw new Error('expected ok');
    expect(freshEdge.band).toBe('fresh');
    expect(freshEdge.ageDays).toBe(30);
    expect(freshnessBand('2026-09-30', NOW).band).toBe('current');
    expect(freshnessBand('2025-10-31', NOW).band).toBe('current');
    expect(freshnessBand('2025-10-30', NOW).band).toBe('stale');
  });

  it('future dates are refused by name', () => {
    expect(freshnessBand('2026-11-01', NOW)).toEqual({
      ok: false,
      reason: 'freshness-future-date',
    });
  });

  it('unparseable dates are refused by name, never guessed', () => {
    expect(freshnessBand('gibberish', NOW)).toEqual({
      ok: false,
      reason: 'freshness-invalid-date:gibberish',
    });
    expect(freshnessBand(42 as unknown as string, NOW)).toEqual({
      ok: false,
      reason: 'freshness-invalid-date',
    });
  });

  it('500-case sweep: bands and ages are exact and monotone in the age', () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const ageDays = Math.floor(rand() * 800);
      const published = new Date(NOW.getTime() - ageDays * 86400000).toISOString();
      const v = freshnessBand(published, NOW);
      if (!v.ok) throw new Error('expected ok at ' + i);
      const expected = ageDays <= 30 ? 'fresh' : ageDays <= 365 ? 'current' : 'stale';
      expect(v.band).toBe(expected);
      expect(v.ageDays).toBe(ageDays);
    }
  });
});
