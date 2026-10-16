// ============================================================================
// FILE: /apps/api/src/modules/taxes/engine/tax-compute.spec.ts
// ============================================================================

import { computeVat } from './tax-compute';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('tax-compute engine', () => {
  it('exclusive VAT at 7.5% on the pinned amount', () => {
    const r = computeVat(100000, 750, 'exclusive');
    if (!r.ok) return;
    expect(r.value.netCents).toBe(100000);
    expect(r.value.vatCents).toBe(7500);
    expect(r.value.grossCents).toBe(107500);
  });

  it('inclusive VAT extracts net from the gross', () => {
    const r = computeVat(107500, 750, 'inclusive');
    if (!r.ok) return;
    expect(r.value.grossCents).toBe(107500);
    expect(r.value.netCents).toBe(100000);
    expect(r.value.vatCents).toBe(7500);
  });

  it('refuses negative amounts and out-of-range rates by name', () => {
    expect(computeVat(-1, 750, 'exclusive').reason).toBe('vat-negative-amount');
    const bad = computeVat(100, 10001, 'exclusive');
    if (!bad.ok) expect(bad.reason).toBe('vat-invalid-rate');
  });

  it('500-case sweep: net + vat = gross for every verdict', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const amount = Math.floor(rnd() * 1000000);
      const rate = Math.floor(rnd() * 10001);
      const mode = rnd() < 0.5 ? 'exclusive' : 'inclusive';
      const v = computeVat(amount, rate, mode);
      if (!v.ok) {
        expect(['vat-negative-amount', 'vat-invalid-rate']).toContain(v.reason);
        continue;
      }
      expect(v.value.netCents + v.value.vatCents).toBe(v.value.grossCents);
    }
  });
});
