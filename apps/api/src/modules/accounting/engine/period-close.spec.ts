// ============================================================================
// FILE: /apps/api/src/modules/accounting/engine/period-close.spec.ts
// ============================================================================

import { periodSummary, validateClose } from './period-close';

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86_400_000;

describe('validateClose', () => {
  const s = new Date(Date.UTC(2026, 0, 1));
  const e = new Date(Date.UTC(2026, 11, 31, 23, 59, 59));
  const now = new Date(Date.UTC(2027, 0, 5));

  it('allows closing an ended open period', () => {
    expect(validateClose({ startsAt: s, endsAt: e, closedAt: null }, now).ok).toBe(true);
  });

  it('refuses double close, future close and inverted ranges with named reasons', () => {
    const again = validateClose({ startsAt: s, endsAt: e, closedAt: now }, now);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toContain('already closed');

    const early = validateClose({ startsAt: s, endsAt: e, closedAt: null }, new Date(Date.UTC(2026, 5, 1)));
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.reason).toContain('has not ended yet');

    const inverted = validateClose({ startsAt: e, endsAt: s, closedAt: null }, now);
    expect(inverted.ok).toBe(false);
    if (!inverted.ok) expect(inverted.reason).toContain('after its start');
  });
});

describe('periodSummary', () => {
  it('counts only journals inside the period window', () => {
    const sum = periodSummary(
      [
        { occurredAt: new Date(Date.UTC(2026, 2, 1)), sourceType: 'invoice_issued', totalCents: 10000 },
        { occurredAt: new Date(Date.UTC(2026, 3, 1)), sourceType: 'invoice_issued', totalCents: 5000 },
        { occurredAt: new Date(Date.UTC(2027, 0, 2)), sourceType: 'invoice_payment', totalCents: 10000 },
      ],
      new Date(Date.UTC(2026, 0, 1)),
      new Date(Date.UTC(2027, 0, 1)),
    );
    expect(sum.journalCount).toBe(2);
    expect(sum.bySource['invoice_issued'].totalCents).toBe(15000);
    expect(sum.bySource['invoice_payment']).toBeUndefined();
  });
});

describe('500-period seeded sweep', () => {
  it('exercises both verdict paths and every refusal is honest', () => {
    const rnd = mulberry32(777);
    let okc = 0;
    let refc = 0;
    for (let i = 0; i < 500; i++) {
      const st = Date.UTC(2025 + Math.floor(rnd() * 2), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28));
      const en = st + Math.floor(rnd() * 300) * DAY_MS;
      const nw = st + Math.floor(rnd() * 400) * DAY_MS;
      const closed = rnd() < 0.3;
      const v = validateClose(
        { startsAt: new Date(st), endsAt: new Date(en), closedAt: closed ? new Date(st) : null },
        new Date(nw),
      );
      if (v.ok) okc++;
      else {
        refc++;
        expect(v.reason.length).toBeGreaterThan(5);
      }
    }
    expect(okc).toBeGreaterThan(50);
    expect(refc).toBeGreaterThan(50);
  });
});
