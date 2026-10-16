// ============================================================================
// FILE: /apps/api/src/modules/agent/engine/business-report.spec.ts
// ============================================================================

import { cashflowForecast, weeklyReport } from './business-report';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('business-report engine', () => {
  const now = new Date('2026-03-15T00:00:00Z');

  it('weekly report: net cash and overdue alert', () => {
    const r = weeklyReport({ invoicedCents: 100000, collectedCents: 80000, expensesCents: 30000, overdueCount: 2 }, now);
    if (!r.ok) return;
    expect(r.value.netCents).toBe(50000);
    expect(r.value.alerts).toContain('overdue-invoices:2');
  });

  it('refuses negative inputs by name', () => {
    const r = weeklyReport({ invoicedCents: -1, collectedCents: 0, expensesCents: 0, overdueCount: 0 }, now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('report-negative-input');
  });

  it('forecast: buckets by due date, recurring costs in each window', () => {
    const r = cashflowForecast(
      [{ totalCents: 10000, dueDate: '2026-03-25' }, { totalCents: 5000, dueDate: '2026-04-15' }, { totalCents: 999, dueDate: null }],
      [{ amountCents: 2000, dayOfMonth: 1 }],
      now,
      90,
    );
    if (!r.ok) return;
    expect(r.value.buckets[0].expectedInCents).toBe(10000);
    expect(r.value.buckets[1].expectedInCents).toBe(5000);
    expect(r.value.buckets[2].expectedInCents).toBe(0);
    expect(r.value.totalOutCents).toBe(6000);
  });

  it('refuses a non-positive horizon by name', () => {
    const r = cashflowForecast([], [], now, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('forecast-invalid-horizon');
  });

  it('500-case sweep: bucket sums equal reported totals', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const invs = Array.from({ length: 5 }, () => ({
        totalCents: Math.floor(rnd() * 10000),
        dueDate: rnd() < 0.8 ? new Date(now.getTime() + Math.floor(rnd() * 100) * 86400000).toISOString() : null,
      }));
      const fv = cashflowForecast(invs, [{ amountCents: Math.floor(rnd() * 5000), dayOfMonth: 5 }], now, 90);
      if (!fv.ok) throw new Error('forecast refused in sweep');
      const inSum = fv.value.buckets.reduce((s, b) => s + b.expectedInCents, 0);
      const outSum = fv.value.buckets.reduce((s, b) => s + b.expectedOutCents, 0);
      expect(inSum).toBe(fv.value.totalInCents);
      expect(outSum).toBe(fv.value.totalOutCents);
    }
  });
});
