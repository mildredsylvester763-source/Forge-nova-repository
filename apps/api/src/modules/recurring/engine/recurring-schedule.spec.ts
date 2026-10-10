// ============================================================================
// FILE: /apps/api/src/modules/recurring/engine/recurring-schedule.spec.ts
// ============================================================================
// Pinned vectors plus a seeded 1000-profile sweep. The clamping rule is the
// heart of this engine: a 31st anchor lands on the last real day of the month.

import {
  advance,
  daysInMonth,
  firstOccurrence,
  nextOccurrence,
  validateAnchor,
} from './recurring-schedule';

const DAY_MS = 86_400_000;
const U = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

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

describe('validateAnchor', () => {
  it('refuses out-of-range anchors with named reasons', () => {
    expect(validateAnchor('weekly', 7).ok).toBe(false);
    expect(validateAnchor('weekly', 0).ok).toBe(true);
    expect(validateAnchor('monthly', 0).ok).toBe(false);
    expect(validateAnchor('monthly', 31).ok).toBe(true);
    expect(validateAnchor('quarterly', 32).ok).toBe(false);
  });
});

describe('nextOccurrence', () => {
  it('clamps a monthly 31st anchor to February 28', () => {
    const o = nextOccurrence(U(2026, 0, 31), 'monthly', 31);
    expect(o.next.toISOString().startsWith('2026-02-28')).toBe(true);
    expect(o.clamped).toBe(true);
  });

  it('rolls a monthly 31st anchor from December into January unclamped', () => {
    const o = nextOccurrence(U(2025, 11, 31), 'monthly', 31);
    expect(o.next.toISOString().startsWith('2026-01-31')).toBe(true);
    expect(o.clamped).toBe(false);
  });

  it('steps a weekly anchor a full week when the day already matches', () => {
    const o = nextOccurrence(U(2026, 9, 7), 'weekly', 3);
    expect(o.next.toISOString().startsWith('2026-10-14')).toBe(true);
  });

  it('clamps a quarterly 31st anchor to November 30', () => {
    const o = nextOccurrence(U(2026, 7, 31), 'quarterly', 31);
    expect(o.next.toISOString().startsWith('2026-11-30')).toBe(true);
    expect(o.clamped).toBe(true);
  });
});

describe('firstOccurrence', () => {
  it('starts the next cycle when the anchor already passed this month', () => {
    const f = firstOccurrence(U(2026, 1, 20), 'monthly', 15);
    expect(f.next.toISOString().startsWith('2026-03-15')).toBe(true);
  });

  it('uses this month when the anchor is still ahead', () => {
    const f = firstOccurrence(U(2026, 1, 1), 'monthly', 15);
    expect(f.next.toISOString().startsWith('2026-02-15')).toBe(true);
  });

  it('starts on the same day for a matching weekly anchor', () => {
    const f = firstOccurrence(U(2026, 9, 7), 'weekly', 3);
    expect(f.next.toISOString().startsWith('2026-10-07')).toBe(true);
  });
});

describe('advance', () => {
  const now = new Date(Date.UTC(2026, 9, 9, 12, 0, 0));

  it('marks a past run due and advances one occurrence', () => {
    const a = advance(
      { frequency: 'monthly', anchorDay: 15, nextRunAt: U(2026, 8, 15), active: true },
      now,
    );
    expect(a.due).toBe(true);
    expect(a.runAt!.toISOString().startsWith('2026-09-15')).toBe(true);
    expect(a.nextRunAt.toISOString().startsWith('2026-10-15')).toBe(true);
  });

  it('refuses future runs and paused profiles with named reasons', () => {
    const future = advance(
      { frequency: 'monthly', anchorDay: 15, nextRunAt: U(2026, 10, 15), active: true },
      now,
    );
    expect(future.due).toBe(false);
    expect(future.reason).toBe('not due yet');
    const paused = advance(
      { frequency: 'weekly', anchorDay: 1, nextRunAt: U(2026, 8, 15), active: false },
      now,
    );
    expect(paused.due).toBe(false);
    expect(paused.reason).toBe('profile is paused');
  });
});

describe('1000-profile seeded sweep', () => {
  it('keeps every invariant honest', () => {
    const rnd = mulberry32(20261009);
    const freqs = ['weekly', 'monthly', 'quarterly'] as const;
    for (let i = 0; i < 1000; i++) {
      const frequency = freqs[Math.floor(rnd() * 3)];
      const anchorDay =
        frequency === 'weekly' ? Math.floor(rnd() * 7) : 1 + Math.floor(rnd() * 31);
      const start = new Date(
        Date.UTC(2024 + Math.floor(rnd() * 4), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28)),
      );
      const first = firstOccurrence(start, frequency, anchorDay);
      expect(first.next.getTime()).toBeGreaterThanOrEqual(start.getTime());
      const second = nextOccurrence(first.next, frequency, anchorDay);
      expect(second.next.getTime()).toBeGreaterThan(first.next.getTime());
      if (frequency !== 'weekly') {
        const y = second.next.getUTCFullYear();
        const m = second.next.getUTCMonth();
        expect(second.next.getUTCDate()).toBe(Math.min(anchorDay, daysInMonth(y, m)));
      } else {
        expect(second.next.getTime() - first.next.getTime()).toBe(7 * DAY_MS);
      }
      const again = nextOccurrence(first.next, frequency, anchorDay);
      expect(again.next.getTime()).toBe(second.next.getTime());
    }
  });
});
