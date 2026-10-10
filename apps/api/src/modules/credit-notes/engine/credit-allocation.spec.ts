// ============================================================================
// FILE: /apps/api/src/modules/credit-notes/engine/credit-allocation.spec.ts
// ============================================================================
// Pinned allocation vectors plus a seeded 500-note sweep: conservation is
// exact, allocations are oldest-first, and applied credit is monotone in the
// credit offered.

import { InvoiceStatus } from '../../invoices/enums';
import { allocateCredit, remainingCredit } from './credit-allocation';

const U = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 12, 0, 0));

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

describe('allocateCredit', () => {
  it('fills the oldest eligible invoice first and caps at each total', () => {
    const result = allocateCredit(10_000, [
      { id: 'b', status: InvoiceStatus.SENT, totalCents: 4_000, dueDate: U(2026, 2, 1) },
      { id: 'a', status: InvoiceStatus.SENT, totalCents: 5_000, dueDate: U(2026, 1, 1) },
      { id: 'c', status: InvoiceStatus.DRAFT, totalCents: 1_000, dueDate: null },
      { id: 'd', status: InvoiceStatus.PAID, totalCents: 3_000, dueDate: null },
    ]);
    expect(result.allocations).toEqual([
      { invoiceId: 'a', appliedCents: 5_000 },
      { invoiceId: 'b', appliedCents: 4_000 },
    ]);
    expect(result.remainingCents).toBe(1_000);
    expect(result.skipped).toHaveLength(2);
  });

  it('sorts invoices without a due date last', () => {
    const result = allocateCredit(1_000, [
      { id: 'x', status: InvoiceStatus.SENT, totalCents: 900, dueDate: null },
      { id: 'y', status: InvoiceStatus.SENT, totalCents: 900, dueDate: U(2026, 3, 1) },
    ]);
    expect(result.allocations[0].invoiceId).toBe('y');
    expect(result.remainingCents).toBe(0);
  });

  it('never applies more than the face value of a small invoice', () => {
    const result = allocateCredit(999_999, [
      { id: 'z', status: InvoiceStatus.OVERDUE, totalCents: 500, dueDate: U(2026, 0, 1) },
    ]);
    expect(result.appliedCents).toBe(500);
    expect(result.remainingCents).toBe(999_499);
  });
});

describe('remainingCredit', () => {
  it('clamps to zero and refuses garbage', () => {
    expect(remainingCredit(1_000, 1_500)).toBe(0);
    expect(remainingCredit(1_000, 400)).toBe(600);
  });
});

describe('500-note seeded sweep', () => {
  it('conserves every cent and stays monotone in credit', () => {
    const rnd = mulberry32(777);
    const statuses: InvoiceStatus[] = ['draft', 'sent', 'paid', 'void', 'overdue'];
    for (let i = 0; i < 500; i++) {
      const credit = Math.floor(rnd() * 50_000);
      const candidates = Array.from({ length: 1 + Math.floor(rnd() * 8) }, (_, j) => ({
        id: 'inv' + j,
        status: statuses[Math.floor(rnd() * 5)],
        totalCents: Math.floor(rnd() * 20_000),
        dueDate: rnd() < 0.8 ? U(2026, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28)) : null,
      }));
      const result = allocateCredit(credit, candidates);
      const sum = result.allocations.reduce((s, a) => s + a.appliedCents, 0);
      expect(sum + result.remainingCents).toBe(Math.max(0, credit));
      expect(result.appliedCents).toBe(sum);
      expect(result.allocations.every((a) => a.appliedCents > 0)).toBe(true);
      expect(result.skipped.length + result.allocations.length).toBeLessThanOrEqual(candidates.length);
      const more = allocateCredit(credit + 1_000, candidates);
      expect(more.appliedCents).toBeGreaterThanOrEqual(result.appliedCents);
    }
  });
});
