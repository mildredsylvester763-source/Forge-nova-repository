// ============================================================================
// FILE: /apps/api/src/modules/customer-statements/engine/statement.spec.ts
// ============================================================================

import { bucketFor, composeStatement, StatementInvoice } from './statement';

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86_400_000;
const NOW = new Date(Date.UTC(2026, 9, 13));

function inv(id: string, due: string | null, amt = 1000, status = 'sent'): StatementInvoice {
  return { id, number: 'INV-' + id, totalCents: amt, status, dueAt: due };
}

describe('bucketFor boundaries', () => {
  it('pins every bucket edge', () => {
    expect(bucketFor(null)).toBe('current');
    expect(bucketFor(0)).toBe('current');
    expect(bucketFor(-1)).toBe('current');
    expect(bucketFor(1)).toBe('1-30');
    expect(bucketFor(30)).toBe('1-30');
    expect(bucketFor(31)).toBe('31-60');
    expect(bucketFor(60)).toBe('31-60');
    expect(bucketFor(61)).toBe('61-90');
    expect(bucketFor(90)).toBe('61-90');
    expect(bucketFor(91)).toBe('90+');
  });
});

describe('composeStatement pins', () => {
  it('buckets the pinned ledger and sums to the outstanding total', () => {
    const invoices = [
      inv('a', '2026-12-01'), // future due -> current
      inv('b', '2026-10-13'), // due today -> current
      inv('c', '2026-09-13'), // 30 days -> 1-30
      inv('d', '2026-08-14'), // 60 days -> 31-60
      inv('e', '2026-07-15'), // 90 days -> 61-90
      inv('f', '2026-07-12'), // 93 days -> 90+
      inv('g', null), // no due date -> current
      inv('h', '2026-01-01', 500, 'paid'), // excluded
    ];
    const s = composeStatement(invoices, NOW);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const byLabel: Record<string, AgingBucket2> = {};
    s.value.buckets.forEach((b) => (byLabel[b.label] = b));
    expect(byLabel['current'].invoiceCount).toBe(3);
    expect(byLabel['current'].totalCents).toBe(3000);
    expect(byLabel['1-30'].invoiceCount).toBe(1);
    expect(byLabel['31-60'].invoiceCount).toBe(1);
    expect(byLabel['61-90'].invoiceCount).toBe(1);
    expect(byLabel['90+'].invoiceCount).toBe(1);
    expect(s.value.outstandingCents).toBe(7000);
  });

  it('refuses when there is nothing outstanding', () => {
    const s = composeStatement([inv('x', null, 1, 'draft')], NOW);
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.reason).toContain('no outstanding invoices');
  });
});

interface AgingBucket2 {
  label: string;
  invoiceCount: number;
  totalCents: number;
}

describe('500-statement seeded sweep', () => {
  it('bucket sums always equal the outstanding total', () => {
    const rnd = mulberry32(808);
    for (let i = 0; i < 500; i++) {
      const pool: StatementInvoice[] = [];
      let expected = 0;
      let openCount = 0;
      for (let k = 0; k < 6; k++) {
        const st = ['sent', 'overdue', 'paid', 'void', 'draft'][Math.floor(rnd() * 5)];
        const due = rnd() < 0.85 ? new Date(NOW.getTime() - Math.floor(rnd() * 200) * DAY_MS).toISOString() : null;
        const amt = 100 + Math.floor(rnd() * 5000);
        pool.push(inv('k' + k, due, amt, st));
        if (st === 'sent' || st === 'overdue') {
          expected += amt;
          openCount++;
        }
      }
      const res = composeStatement(pool, NOW);
      if (openCount === 0) {
        expect(res.ok).toBe(false);
      } else {
        expect(res.ok).toBe(true);
        if (!res.ok) continue;
        const sum = res.value.buckets.reduce((s, b) => s + b.totalCents, 0);
        const cnt = res.value.buckets.reduce((s, b) => s + b.invoiceCount, 0);
        expect(sum).toBe(res.value.outstandingCents);
        expect(sum).toBe(expected);
        expect(cnt).toBe(openCount);
      }
    }
  });
});
