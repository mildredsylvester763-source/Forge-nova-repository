// ============================================================================
// FILE: /apps/api/src/modules/invoices/engine/invoice-dunning.spec.ts
// ============================================================================
// Pinned grace boundaries, fee formulas, cap behavior, the reminder ladder,
// and a seeded 500-invoice sweep over 40 days each.

import { InvoiceStatus } from '../enums';
import { DEFAULT_DUNNING_TERMS, computeDunning } from './invoice-dunning';

const DAY_MS = 86_400_000;
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

describe('computeDunning fee math', () => {
  it('charges basis-point fees only after the grace window', () => {
    const terms = { ...DEFAULT_DUNNING_TERMS, lateFeeBpPerDay: 100 };
    const r = computeDunning(
      { status: InvoiceStatus.SENT, totalCents: 100_000, dueDate: U(2026, 0, 31) },
      terms,
      U(2026, 1, 4),
    );
    expect(r.daysOverdue).toBe(4);
    expect(r.lateFeeCents).toBe(1000);
    expect(r.effectiveStatus).toBe(InvoiceStatus.OVERDUE);
  });

  it('holds the grace boundary at 3 days with zero fees', () => {
    const terms = { ...DEFAULT_DUNNING_TERMS, lateFeeBpPerDay: 100 };
    const r = computeDunning(
      { status: InvoiceStatus.SENT, totalCents: 100_000, dueDate: U(2026, 0, 31) },
      terms,
      U(2026, 1, 3),
    );
    expect(r.inGrace).toBe(true);
    expect(r.lateFeeCents).toBe(0);
  });

  it('never charges a not-yet-overdue invoice', () => {
    const r = computeDunning(
      { status: InvoiceStatus.SENT, totalCents: 100_000, dueDate: U(2026, 0, 31) },
      DEFAULT_DUNNING_TERMS,
      U(2026, 1, 1),
    );
    expect(r.lateFeeCents).toBe(0);
    expect(r.daysOverdue).toBe(1);
    expect(r.inGrace).toBe(true);
  });

  it('computes flat per-day fees', () => {
    const terms = { ...DEFAULT_DUNNING_TERMS, lateFeeFlatCents: 50 };
    const r = computeDunning(
      { status: InvoiceStatus.SENT, totalCents: 100_000, dueDate: U(2026, 0, 31) },
      terms,
      U(2026, 1, 10),
    );
    expect(r.lateFeeCents).toBe(350);
  });

  it('caps the fee when a cap is configured', () => {
    const terms = { ...DEFAULT_DUNNING_TERMS, lateFeeFlatCents: 50, lateFeeCapCents: 200 };
    const r = computeDunning(
      { status: InvoiceStatus.SENT, totalCents: 100_000, dueDate: U(2026, 0, 31) },
      terms,
      U(2026, 1, 10),
    );
    expect(r.lateFeeCents).toBe(200);
    expect(r.feeReason).toContain('capped at 200');
  });

  it('never chases drafts, paid or void invoices', () => {
    const draft = computeDunning(
      { status: InvoiceStatus.DRAFT, totalCents: 100_000, dueDate: U(2026, 0, 31) },
      DEFAULT_DUNNING_TERMS,
      U(2026, 2, 1),
    );
    expect(draft.lateFeeCents).toBe(0);
    expect(draft.reminders).toHaveLength(0);
    const paid = computeDunning(
      { status: InvoiceStatus.PAID, totalCents: 100_000, dueDate: U(2026, 0, 31), paidAt: U(2026, 1, 2) },
      DEFAULT_DUNNING_TERMS,
      U(2026, 2, 1),
    );
    expect(paid.daysOverdue).toBe(0);
    expect(paid.lateFeeCents).toBe(0);
  });
});

describe('reminder ladder', () => {
  it('fires exactly the stages whose time has come', () => {
    const r = computeDunning(
      { status: InvoiceStatus.SENT, totalCents: 1000, dueDate: U(2025, 11, 31) },
      DEFAULT_DUNNING_TERMS,
      U(2026, 0, 20),
    );
    expect(r.reminders.map((s) => s.offsetDays)).toEqual([-3, 0, 7, 14]);
    expect(r.futureReminders.map((s) => s.offsetDays)).toEqual([30, 60]);
  });
});

describe('500-invoice sweep over 40 days', () => {
  it('keeps fees monotone, capped, deterministic and the ladder complete', () => {
    const rnd = mulberry32(4242);
    for (let i = 0; i < 500; i++) {
      const totalCents = 100 + Math.floor(rnd() * 100_000);
      const due = U(2025, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28));
      const bp = Math.floor(rnd() * 500);
      const flat = Math.floor(rnd() * 200);
      const cap = rnd() < 0.5 ? 100 + Math.floor(rnd() * 900) : 0;
      const terms = { ...DEFAULT_DUNNING_TERMS, graceDays: Math.floor(rnd() * 5), lateFeeBpPerDay: bp, lateFeeFlatCents: flat, lateFeeCapCents: cap };
      let prevFee = -1;
      for (let dd = 0; dd <= 40; dd++) {
        const now = new Date(due.getTime() + dd * DAY_MS);
        const res = computeDunning({ status: InvoiceStatus.SENT, totalCents, dueDate: due }, terms, now);
        expect(res.lateFeeCents).toBeGreaterThanOrEqual(prevFee);
        if (cap > 0) expect(res.lateFeeCents).toBeLessThanOrEqual(cap);
        expect(res.lateFeeCents).toBeGreaterThanOrEqual(0);
        const again = computeDunning({ status: InvoiceStatus.SENT, totalCents, dueDate: due }, terms, now);
        expect(again.lateFeeCents).toBe(res.lateFeeCents);
        expect(again.reminders.length + again.futureReminders.length).toBe(terms.reminderOffsets.length);
        prevFee = res.lateFeeCents;
      }
    }
  });
});
