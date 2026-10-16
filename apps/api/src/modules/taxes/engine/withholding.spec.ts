// ============================================================================
// FILE: /apps/api/src/modules/taxes/engine/withholding.spec.ts
// ============================================================================

import { computeWithholding } from './withholding';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('withholding engine', () => {
  it('service at 10% on the pinned amount', () => {
    const r = computeWithholding(200000, 'service');
    if (!r.ok) return;
    expect(r.value.whtCents).toBe(20000);
    expect(r.value.netCents).toBe(180000);
    expect(r.value.rateBps).toBe(1000);
  });

  it('contract at 5%', () => {
    const r = computeWithholding(100000, 'contract');
    if (!r.ok) return;
    expect(r.value.whtCents).toBe(5000);
    expect(r.value.rateBps).toBe(500);
  });

  it('refuses unknown kinds and negative amounts by name', () => {
    const unknown = computeWithholding(100, 'miscellaneous');
    if (!unknown.ok) expect(unknown.reason).toBe('wht-unknown-kind:miscellaneous');
    const negative = computeWithholding(-1, 'service');
    if (!negative.ok) expect(negative.reason).toBe('wht-negative-amount');
  });

  it('500-case sweep: wht + net = gross, only pinned kinds accepted', () => {
    const rnd = mulberry32(42);
    const kinds = ['service', 'rent', 'royalty', 'dividend', 'contract', 'professional', 'misc', 'gift'];
    for (let i = 0; i < 500; i++) {
      const gross = Math.floor(rnd() * 1000000);
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      const v = computeWithholding(gross, kind);
      if (!v.ok) {
        expect(v.reason.startsWith('wht-unknown-kind:')).toBe(true);
        continue;
      }
      expect(v.value.whtCents + v.value.netCents).toBe(gross);
      expect(v.value.rateBps).toBe(kind === 'contract' || kind === 'professional' ? 500 : 1000);
    }
  });
});
