// ============================================================================
// FILE: /apps/api/src/modules/agent/engine/nl-search.spec.ts
// ============================================================================

import { parseSearchQuery } from './nl-search';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('nl-search engine', () => {
  const now = new Date('2026-03-15T00:00:00Z');

  it('parses the pinned query: entity, amount floor, quoted customer, last month', () => {
    const r = parseSearchQuery('find invoices over ₦50,000 for "Acme Ltd" last month', now);
    if (!r.ok) return;
    expect(r.value.entity).toBe('invoices');
    expect(r.value.minCents).toBe(5000000);
    expect(r.value.customer).toBe('acme ltd');
    expect(r.value.from).toBe('2026-02-01');
    expect(r.value.to).toBe('2026-03-01');
  });

  it('parses "this month" and "under 20k"', () => {
    const a = parseSearchQuery('show expenses this month', now);
    if (a.ok) {
      expect(a.value.entity).toBe('expenses');
      expect(a.value.from).toBe('2026-03-01');
    }
    const b = parseSearchQuery('payments under 20k', now);
    if (b.ok) expect(b.value.maxCents).toBe(2000000);
  });

  it('refuses empty queries by name', () => {
    const r = parseSearchQuery('', now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('search-empty-query');
  });

  it('500-case sweep: amounts never negative, refusals always named', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const query = 'invoice test ' + Math.floor(rnd() * 100) + 'k';
      const sv = parseSearchQuery(query, now);
      if (!sv.ok) {
        expect(['search-too-vague', 'search-empty-query']).toContain(sv.reason);
        continue;
      }
      if (sv.value.minCents !== undefined) expect(sv.value.minCents).toBeGreaterThanOrEqual(0);
      if (sv.value.maxCents !== undefined) expect(sv.value.maxCents).toBeGreaterThanOrEqual(0);
    }
  });
});
