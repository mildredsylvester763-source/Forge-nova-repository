// ============================================================================
// FILE: /apps/api/src/modules/expenses/engine/expense-validate.spec.ts
// ============================================================================

import { normalizeCategory, validateExpense } from './expense-validate';

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86_400_000;
const NOW = new Date(Date.UTC(2026, 9, 13));

describe('validateExpense pins', () => {
  it('accepts an honest expense', () => {
    expect(
      validateExpense({ description: ' Hosting ', amountCents: 2500, incurredAt: '2026-10-01T00:00:00Z', now: NOW }).ok,
    ).toBe(true);
  });

  it('refuses blank descriptions and non-positive amounts', () => {
    const blank = validateExpense({ description: '  ', amountCents: 2500, incurredAt: '2026-10-01T00:00:00Z', now: NOW });
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.reason).toContain('description');
    const negative = validateExpense({ description: 'x', amountCents: -1, incurredAt: '2026-10-01T00:00:00Z', now: NOW });
    expect(negative.ok).toBe(false);
    if (!negative.ok) expect(negative.reason).toContain('positive integer');
  });

  it('refuses far-future dates but tolerates a day of clock skew', () => {
    const future = validateExpense({ description: 'x', amountCents: 1, incurredAt: '2027-01-01T00:00:00Z', now: NOW });
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.reason).toContain('future');
    const skew = validateExpense({
      description: 'x',
      amountCents: 1,
      incurredAt: new Date(NOW.getTime() + 12 * 3_600_000).toISOString(),
      now: NOW,
    });
    expect(skew.ok).toBe(true);
  });

  it('refuses unparseable dates', () => {
    expect(
      validateExpense({ description: 'x', amountCents: 1, incurredAt: 'nope', now: NOW }).ok,
    ).toBe(false);
  });
});

describe('normalizeCategory', () => {
  it('slugifies and defaults', () => {
    expect(normalizeCategory('  Web Hosting ')).toBe('web-hosting');
    expect(normalizeCategory(null)).toBe('uncategorized');
    expect(normalizeCategory('   ')).toBe('uncategorized');
  });
});

describe('500-expense seeded sweep', () => {
  it('accepts exactly the honest combinations', () => {
    const rnd = mulberry32(2026);
    for (let i = 0; i < 500; i++) {
      const amt = Math.floor(rnd() * 100) - 10;
      const dayOff = Math.floor(rnd() * 60) - 10;
      const v = validateExpense({
        description: 'desc',
        amountCents: amt,
        incurredAt: new Date(NOW.getTime() + dayOff * DAY_MS).toISOString(),
        now: NOW,
      });
      if (amt <= 0) expect(v.ok).toBe(false);
      else if (dayOff > 1) expect(v.ok).toBe(false);
      else expect(v.ok).toBe(true);
    }
  });
});
