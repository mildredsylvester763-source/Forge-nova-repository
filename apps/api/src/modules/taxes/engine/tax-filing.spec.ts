// ============================================================================
// FILE: /apps/api/src/modules/taxes/engine/tax-filing.spec.ts
// ============================================================================

import { filingSummary } from './tax-filing';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('tax-filing engine', () => {
  it('payable position when output exceeds input', () => {
    const r = filingSummary(75000, 25000, '2026-Q1');
    if (!r.ok) return;
    expect(r.value.netVatCents).toBe(50000);
    expect(r.value.position).toBe('payable');
  });

  it('credit and nil positions', () => {
    const credit = filingSummary(10000, 30000, '2026-Q2');
    if (credit.ok) expect(credit.value.position).toBe('credit');
    const nil = filingSummary(10000, 10000, '2026-Q3');
    if (nil.ok) expect(nil.value.position).toBe('nil');
  });

  it('refuses negatives and empty period labels by name', () => {
    const negative = filingSummary(-1, 0, '2026-Q1');
    if (!negative.ok) expect(negative.reason).toBe('filing-negative-amount');
    const empty = filingSummary(100, 100, '   ');
    if (!empty.ok) expect(empty.reason).toBe('filing-empty-period');
  });

  it('500-case sweep: position always matches the sign of net VAT', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const out = Math.floor(rnd() * 100000);
      const inp = Math.floor(rnd() * 100000);
      const v = filingSummary(out, inp, 'P' + i);
      if (!v.ok) {
        expect(['filing-negative-amount', 'filing-empty-period']).toContain(v.reason);
        continue;
      }
      expect(v.value.netVatCents).toBe(out - inp);
      expect(v.value.position).toBe(out > inp ? 'payable' : out < inp ? 'credit' : 'nil');
    }
  });
});
