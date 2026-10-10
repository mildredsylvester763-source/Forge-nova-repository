// Invoice math contract. Every pinned vector was computed by hand before it
// was written down; the sweep guards the invariants (totals always equal
// subtotal + tax, tax within half-a-cent rounding, integers everywhere).

import { canTransition, computeTotals, dueDateFor, effectiveStatus } from './invoice-math';
import { InvoiceStatus } from '../enums';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('computeTotals (cent-exact)', () => {
  it('pins the plain vector: 2 × $150 = $300, no tax', () => {
    const t = computeTotals([{ description: 'Logo design', quantity: 2, unitPrice: 150 }], 0);
    expect(t.lineItems[0].lineTotalCents).toBe(30000);
    expect(t.subtotalCents).toBe(30000);
    expect(t.taxCents).toBe(0);
    expect(t.totalCents).toBe(30000);
    expect(t.invalidLines).toEqual([]);
  });

  it('pins 3 × $19.99 at 10% tax: subtotal $59.97, tax $6.00, total $65.97', () => {
    const t = computeTotals([{ description: 'Consulting hour', quantity: 3, unitPrice: 19.99 }], 1000);
    expect(t.subtotalCents).toBe(5997);
    expect(t.taxCents).toBe(600);
    expect(t.totalCents).toBe(6597);
  });

  it('accepts fractional quantities: 0.5 × $10 = $5.00', () => {
    const t = computeTotals([{ description: 'Partial delivery', quantity: 0.5, unitPrice: 10 }]);
    expect(t.lineItems[0].lineTotalCents).toBe(500);
    expect(t.subtotalCents).toBe(500);
  });

  it('rounds half-up at the tax boundary: 5 cents at 10% → 1 cent of tax', () => {
    const t = computeTotals([{ description: 'Postage', quantity: 1, unitPrice: 0.05 }], 1000);
    expect(t.subtotalCents).toBe(5);
    expect(t.taxCents).toBe(1);
  });

  it('refuses invalid lines by name and never lets them touch the subtotal', () => {
    const t = computeTotals([
      { description: 'ok', quantity: 1, unitPrice: 5 },
      { description: '   ', quantity: 1, unitPrice: 5 },
      { description: 'neg', quantity: -1, unitPrice: 5 },
      { description: 'nan', quantity: 1, unitPrice: Number.NaN },
    ]);
    expect(t.invalidLines.map((l) => l.reason)).toEqual([
      'missing description',
      'quantity must be a positive number',
      'unit price must be a non-negative number',
    ]);
    expect(t.subtotalCents).toBe(500);
    expect(t.lineItems).toHaveLength(1);
  });

  it('sweeps 1000 random carts: totals are always subtotal + tax, tax within rounding bounds', () => {
    const rand = mulberry32(20261009);
    for (let i = 0; i < 1000; i++) {
      const items = Array.from({ length: 1 + Math.floor(rand() * 5) }, () => ({
        description: 'item ' + i,
        quantity: Math.round(rand() * 5000) / 100 + 0.01,
        unitPrice: Math.round(rand() * 50000) / 100 + 0.01,
      }));
      const taxRateBp = Math.floor(rand() * 3001);
      const t = computeTotals(items, taxRateBp);
      expect(Number.isInteger(t.subtotalCents)).toBe(true);
      expect(t.lineItems.reduce((s, l) => s + l.lineTotalCents, 0)).toBe(t.subtotalCents);
      expect(t.taxCents).toBe(Math.round((t.subtotalCents * taxRateBp) / 10000));
      expect(t.totalCents).toBe(t.subtotalCents + t.taxCents);
    }
  });
});

describe('dueDateFor', () => {
  it('pins Jan 31 + 30 days → Mar 2 (February is short in 2026)', () => {
    expect(dueDateFor(new Date('2026-01-31T00:00:00Z'), 30).toISOString()).toBe('2026-03-02T00:00:00.000Z');
  });

  it('pins Feb 28 2026 + 1 day → Mar 1, and net 0 → the same instant', () => {
    expect(dueDateFor(new Date('2026-02-28T00:00:00Z'), 1).toISOString()).toBe('2026-03-01T00:00:00.000Z');
    const issue = new Date('2026-05-05T12:00:00Z');
    expect(dueDateFor(issue, 0).getTime()).toBe(issue.getTime());
  });

  it('falls back to the 30-day default on garbage instead of inventing a date', () => {
    expect(dueDateFor(new Date('2026-01-01T00:00:00Z'), -5).toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });
});

describe('effectiveStatus (overdue projection)', () => {
  const due = new Date('2026-06-10T00:00:00Z');

  it('is not overdue ON the due date, only strictly after it', () => {
    expect(effectiveStatus(InvoiceStatus.SENT, due, due, undefined)).toBe(InvoiceStatus.SENT);
    expect(effectiveStatus(InvoiceStatus.SENT, new Date(due.getTime() + 1), due, undefined)).toBe(InvoiceStatus.OVERDUE);
  });

  it('never flips a paid, void, or draft invoice — no matter how late', () => {
    const wayPast = new Date(due.getTime() + 1_000_000_000);
    expect(effectiveStatus(InvoiceStatus.PAID, wayPast, due, new Date())).toBe(InvoiceStatus.PAID);
    expect(effectiveStatus(InvoiceStatus.VOID, wayPast, due, undefined)).toBe(InvoiceStatus.VOID);
    expect(effectiveStatus(InvoiceStatus.DRAFT, wayPast, due, undefined)).toBe(InvoiceStatus.DRAFT);
  });
});

describe('canTransition (state machine)', () => {
  it('allows the honest path and refuses the dishonest ones by name', () => {
    expect(canTransition(InvoiceStatus.DRAFT, InvoiceStatus.SENT).allowed).toBe(true);
    expect(canTransition(InvoiceStatus.SENT, InvoiceStatus.PAID).allowed).toBe(true);
    expect(canTransition(InvoiceStatus.OVERDUE, InvoiceStatus.PAID).allowed).toBe(true);
    expect(canTransition(InvoiceStatus.DRAFT, InvoiceStatus.VOID).allowed).toBe(true);
    expect(canTransition(InvoiceStatus.DRAFT, InvoiceStatus.PAID).reason).toContain('send the invoice');
    expect(canTransition(InvoiceStatus.PAID, InvoiceStatus.VOID).reason).toContain('final');
    expect(canTransition(InvoiceStatus.VOID, InvoiceStatus.PAID).allowed).toBe(false);
    expect(canTransition(InvoiceStatus.SENT, InvoiceStatus.OVERDUE).reason).toContain('never set by hand');
    expect(canTransition(InvoiceStatus.SENT, InvoiceStatus.SENT).allowed).toBe(false);
  });
});
