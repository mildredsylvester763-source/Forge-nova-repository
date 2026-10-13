// ============================================================================
// FILE: /apps/api/src/modules/receipts/engine/receipt-format.spec.ts
// ============================================================================

import { formatReceiptNumber, validateReceiptInput } from './receipt-format';

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('formatReceiptNumber', () => {
  it('pins zero-padding and rollover', () => {
    expect(formatReceiptNumber(1)).toEqual({ ok: true, value: 'REC-0001' });
    expect(formatReceiptNumber(9999)).toEqual({ ok: true, value: 'REC-9999' });
    expect(formatReceiptNumber(10000)).toEqual({ ok: true, value: 'REC-10000' });
    const zero = formatReceiptNumber(0);
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.reason).toContain('positive integer');
  });
});

describe('validateReceiptInput', () => {
  it('refuses non-positive payments and missing received dates', () => {
    const badAmount = validateReceiptInput({ amountCents: 0, receivedAt: new Date() });
    expect(badAmount.ok).toBe(false);
    if (!badAmount.ok) expect(badAmount.reason).toContain('positive payment amount');
    const noDate = validateReceiptInput({ amountCents: 500, receivedAt: null });
    expect(noDate.ok).toBe(false);
    if (!noDate.ok) expect(noDate.reason).toContain('received date');
  });
});

describe('500-receipt seeded sweep', () => {
  it('accepts only sequences in range with the REC- prefix', () => {
    const rnd = mulberry32(55);
    for (let i = 0; i < 500; i++) {
      const seq = Math.floor(rnd() * 100000000) - 5;
      const v = formatReceiptNumber(seq);
      if (seq >= 1 && seq <= 99999999) {
        expect(v.ok).toBe(true);
        if (v.ok) expect(v.value.startsWith('REC-')).toBe(true);
      } else {
        expect(v.ok).toBe(false);
      }
    }
  });
});
