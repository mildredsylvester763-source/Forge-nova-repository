// ============================================================================
// FILE: /apps/api/src/modules/seasonal/engine/seasonal-calendar.spec.ts
// ============================================================================
// Pinned holidays, then edge cases, then a 500-calendar sweep. The engine
// is pure and deterministic: the same year always renders the same plan.

import { buildCalendar, MONTH_NAMES } from './seasonal-calendar';

describe('seasonal calendar engine', () => {
  it('rejects anything that is not exactly 12 monthly indices', () => {
    expect(() => buildCalendar([])).toThrow(/exactly 12/);
    expect(() => buildCalendar([1, 2, 3])).toThrow(/exactly 12/);
    expect(() => buildCalendar(new Array(13).fill(50))).toThrow(/exactly 12/);
  });

  it('rejects non-finite months with the offending month named', () => {
    const year = new Array(12).fill(50);
    year[3] = Number.NaN;
    expect(() => buildCalendar(year)).toThrow(/April/);
  });

  it('rescales 0-1 ratio input onto the 0-100 scale', () => {
    const calendar = buildCalendar([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.5, 1]);
    expect(calendar.months[11]).toBe(100);
    expect(calendar.months[0]).toBe(10);
    expect(calendar.profile).toBe('strong');
  });

  it('finds a December-only peak with a September prep window', () => {
    const calendar = buildCalendar([10, 10, 10, 10, 10, 10, 10, 10, 10, 20, 55, 95]);
    expect(calendar.peakMonths).toEqual([11]);
    expect(calendar.triggerMonths).toContain(11);
    expect(calendar.prepMonths).toEqual([9]); // November - 2 = September
    expect(calendar.strength).toBe(85);
    expect(calendar.profile).toBe('strong');
    expect(calendar.reasons.join(' ')).toContain('December');
  });

  it('calls flat demand flat instead of inventing windows', () => {
    const calendar = buildCalendar(new Array(12).fill(50));
    expect(calendar.profile).toBe('flat');
    expect(calendar.peakMonths).toEqual([]);
    expect(calendar.triggerMonths).toEqual([]);
    expect(calendar.reasons.join(' ')).toContain('flat');
  });

  it('reports all-zero input as flat with a named reason', () => {
    const calendar = buildCalendar(new Array(12).fill(0));
    expect(calendar.profile).toBe('flat');
    expect(calendar.reasons.join(' ')).toContain('no measurable demand');
  });

  it('wraps prep across the year boundary (January trigger preps in November)', () => {
    const calendar = buildCalendar([95, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20]);
    expect(calendar.prepMonths).toEqual([10]);
  });

  it('clamps out-of-range values instead of trusting them', () => {
    const calendar = buildCalendar([150, -40, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50]);
    expect(calendar.months[0]).toBe(100);
    expect(calendar.months[1]).toBe(0);
  });

  it('holds its invariants across a 500-calendar sweep', () => {
    let state = 20261009 >>> 0;
    const rand = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    for (let sweep = 0; sweep < 500; sweep++) {
      const year: number[] = [];
      for (let m = 0; m < 12; m++) year.push(Math.round(rand() * 100));
      const calendar = buildCalendar(year);
      expect(calendar.months).toHaveLength(12);
      for (const value of calendar.months) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
      // Peaks always sit within the band of the max; triggers never exceed peaks' band.
      const max = Math.max(...calendar.months);
      if (max > 0 && calendar.strength >= 20) {
        expect(calendar.peakMonths.length).toBeGreaterThan(0);
        for (const p of calendar.peakMonths) expect(calendar.months[p]).toBeGreaterThanOrEqual(max - 10);
        for (const t of calendar.triggerMonths) {
          expect(calendar.months[t]).toBeGreaterThanOrEqual(Math.max(0.75 * max, max - 25));
        }
      }
      // Prep months are unique and in range.
      expect(new Set(calendar.prepMonths).size).toBe(calendar.prepMonths.length);
      for (const p of calendar.prepMonths) expect(p).toBeGreaterThanOrEqual(0);
    }
  });

  it('names all twelve months in order', () => {
    expect(MONTH_NAMES[0]).toBe('January');
    expect(MONTH_NAMES[11]).toBe('December');
    expect(MONTH_NAMES).toHaveLength(12);
  });
});
