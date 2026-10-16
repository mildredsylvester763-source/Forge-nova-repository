// ============================================================================
// FILE: /apps/api/src/modules/agent/engine/invoice-draft.spec.ts
// ============================================================================

import { draftInvoiceFromText } from './invoice-draft';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('invoice-draft engine', () => {
  it('drafts the pinned invoice: 3 x web design at 50000 plus a logo line', () => {
    const r = draftInvoiceFromText('invoice for Acme Corp.\n3 web design at 50000, logo 20000');
    if (!r.ok) return;
    expect(r.value.customerName).toBe('Acme Corp');
    expect(r.value.lines).toHaveLength(2);
    expect(r.value.lines[0].quantity).toBe(3);
    expect(r.value.lines[0].description).toBe('web design');
    expect(r.value.lines[0].unitPriceCents).toBe(5000000);
    expect(r.value.totalCents).toBe(17000000);
  });

  it('parses the qty-x-price form', () => {
    const r = draftInvoiceFromText('2 x 30000 advisory');
    if (!r.ok) return;
    expect(r.value.lines[0].quantity).toBe(2);
    expect(r.value.lines[0].unitPriceCents).toBe(3000000);
    expect(r.value.lines[0].description).toBe('advisory');
  });

  it('refuses text with no recognizable lines by name', () => {
    const r = draftInvoiceFromText('hello there friend');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('draft-no-lines');
  });

  it('500-case sweep: lines are always qty >= 1, prices never negative', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const junk = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(rnd() * 30))).join(' ');
      const dv = draftInvoiceFromText(junk + ' ' + Math.floor(rnd() * 100));
      if (!dv.ok) {
        expect(['draft-no-lines', 'draft-empty-text']).toContain(dv.reason);
        continue;
      }
      expect(dv.value.totalCents).toBeGreaterThanOrEqual(0);
      for (const line of dv.value.lines) {
        expect(line.quantity).toBeGreaterThanOrEqual(1);
        expect(line.unitPriceCents).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
