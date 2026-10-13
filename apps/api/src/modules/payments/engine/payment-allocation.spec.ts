// ============================================================================
// FILE: /apps/api/src/modules/payments/engine/payment-allocation.spec.ts
// ============================================================================
// Pinned water-fill vectors plus a seeded 500-payment sweep with the
// only-last-partial invariant.

import { allocatePayment, AllocatableInvoice } from './payment-allocation';

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inv(id: string, number: string, total: number, due: string | null, status = 'sent'): AllocatableInvoice {
  return { id, number, totalCents: total, dueAt: due, status };
}

const OLDEST = inv('i1', 'INV-0002', 4000, '2026-01-01');
const NEWER = inv('i2', 'INV-0001', 6000, '2026-03-01');

describe('allocatePayment pins', () => {
  it('water-fills the oldest due date first', () => {
    const r = allocatePayment([NEWER, OLDEST], 4000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.allocations).toHaveLength(1);
    expect(r.value.allocations[0].invoiceId).toBe('i1');
    expect(r.value.allocations[0].fullyPaid).toBe(true);
  });

  it('spills overflow into the next oldest invoice', () => {
    const r = allocatePayment([NEWER, OLDEST], 7000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.allocations).toHaveLength(2);
    expect(r.value.allocations[1].invoiceId).toBe('i2');
    expect(r.value.allocations[1].amountCents).toBe(3000);
    expect(r.value.allocations[1].fullyPaid).toBe(false);
  });

  it('refuses overpayment with the exact excess', () => {
    const r = allocatePayment([NEWER, OLDEST], 11000);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('exceeds the outstanding balance by 1000 cents');
  });

  it('refuses when there is nothing open and refuses non-positive amounts', () => {
    const none = allocatePayment([inv('x', 'INV-0009', 1, null, 'draft')], 100);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.reason).toContain('no open invoices');
    expect(allocatePayment([OLDEST], 0).ok).toBe(false);
    expect(allocatePayment([OLDEST], -5).ok).toBe(false);
  });

  it('sorts invoices with no due date last', () => {
    const r = allocatePayment(
      [inv('i3', 'INV-0003', 1000, null), inv('i4', 'INV-0004', 1000, '2026-02-02')],
      1000,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.allocations[0].invoiceId).toBe('i4');
  });
});

describe('500-payment seeded sweep', () => {
  it('never mis-orders, mis-sums or double-partials', () => {
    const rnd = mulberry32(999);
    let allocated = 0;
    let refused = 0;
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(rnd() * 5);
      const pool: AllocatableInvoice[] = [];
      let total = 0;
      for (let k = 0; k < n; k++) {
        const st = ['sent', 'sent', 'overdue', 'paid', 'draft', 'void'][Math.floor(rnd() * 6)];
        const amt = 100 + Math.floor(rnd() * 9900);
        const due =
          rnd() < 0.8
            ? new Date(Date.UTC(2026, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28))).toISOString()
            : null;
        pool.push(inv('s' + k, 'INV-' + String(k).padStart(4, '0'), amt, due, st));
        if (st === 'sent' || st === 'overdue') total += amt;
      }
      const pay = rnd() < 0.5 ? total + Math.floor(rnd() * 500) : Math.max(1, Math.floor(rnd() * (total + 1)));
      const v = allocatePayment(pool, pay);
      if (!v.ok) {
        refused++;
        continue;
      }
      allocated++;
      const sum = v.value.allocations.reduce((s, x) => s + x.amountCents, 0);
      expect(sum).toBe(pay);
      for (let k = 1; k < v.value.allocations.length; k++) {
        const p = pool.find((x) => x.id === v.value.allocations[k - 1].invoiceId)!;
        const q = pool.find((x) => x.id === v.value.allocations[k].invoiceId)!;
        const pt = p.dueAt ? new Date(p.dueAt).getTime() : Number.POSITIVE_INFINITY;
        const qt = q.dueAt ? new Date(q.dueAt).getTime() : Number.POSITIVE_INFINITY;
        expect(pt).toBeLessThanOrEqual(qt);
      }
      const partial = v.value.allocations.filter((x) => !x.fullyPaid);
      expect(partial.length).toBeLessThanOrEqual(1);
      if (partial.length === 1) {
        expect(partial[0]).toBe(v.value.allocations[v.value.allocations.length - 1]);
      }
    }
    expect(allocated).toBeGreaterThan(100);
    expect(refused).toBeGreaterThan(50);
  });
});
