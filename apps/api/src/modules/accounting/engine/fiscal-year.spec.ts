// ============================================================================
// FILE: /apps/api/src/modules/accounting/engine/fiscal-year.spec.ts
// ============================================================================
// Pinned fiscal-calendar boundaries plus a seeded 500-day sweep.

import { parseDay, periodOverlaps, resolveFiscalYear } from './fiscal-year';

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86_400_000;

describe('resolveFiscalYear', () => {
  it('pins the calendar year', () => {
    const r = resolveFiscalYear('2026-03-15', 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.key).toBe('FY2026');
      expect(r.value.startsAt).toBe('2026-01-01');
      expect(r.value.endsAtExclusive).toBe('2027-01-01');
    }
  });

  it('puts a March day inside an April-starting PRIOR fiscal year', () => {
    const r = resolveFiscalYear('2026-03-15', 4);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.key).toBe('FY2025');
      expect(r.value.startsAt).toBe('2025-04-01');
      expect(r.value.endsAtExclusive).toBe('2026-04-01');
    }
    const may = resolveFiscalYear('2026-05-15', 4);
    expect(may.ok).toBe(true);
    if (may.ok) {
      expect(may.value.key).toBe('FY2026');
      expect(may.value.startsAt).toBe('2026-04-01');
    }
  });

  it('refuses bad months and bad dates with named reasons', () => {
    const month = resolveFiscalYear('2026-01-01', 13);
    expect(month.ok).toBe(false);
    if (!month.ok) expect(month.reason).toContain('integer between 1 and 12');
    const date = resolveFiscalYear('2026-13-01', 1);
    expect(date.ok).toBe(false);
    if (!date.ok) expect(date.reason).toContain('YYYY-MM-DD');
  });
});

describe('periodOverlaps', () => {
  it('detects and misses overlaps exactly', () => {
    const existing = [{ startsAt: '2026-01-01', endsAtExclusive: '2027-01-01' }];
    expect(periodOverlaps(existing, '2026-06-01', '2026-07-01')).toHaveLength(1);
    expect(periodOverlaps(existing, '2027-01-01', '2027-02-01')).toHaveLength(0);
  });
});

describe('500-day seeded sweep', () => {
  it('stays consistent across every start month and date', () => {
    const rnd = mulberry32(1234);
    for (let i = 0; i < 500; i++) {
      const sm = 1 + Math.floor(rnd() * 12);
      const y = 2020 + Math.floor(rnd() * 10);
      const mo = 1 + Math.floor(rnd() * 12);
      const day = 1 + Math.floor(rnd() * 28);
      const res = resolveFiscalYear(
        `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        sm,
      );
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      const expectedFY = mo >= sm ? y : y - 1;
      expect(res.value.key).toBe('FY' + expectedFY);
      const s = parseDay(res.value.startsAt);
      const e = parseDay(res.value.endsAtExclusive);
      expect(s).not.toBeNull();
      expect(e).not.toBeNull();
      const span = e! - s!;
      expect([365 * DAY_MS, 366 * DAY_MS]).toContain(span);
    }
  });
});
