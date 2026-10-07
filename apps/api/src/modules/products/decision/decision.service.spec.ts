// ============================================================================
// FILE: /apps/api/src/modules/products/decision/decision.service.spec.ts
// ============================================================================
// Pinned vectors + boundary tests + a 1000-case seeded invariant sweep.
// If any threshold or rule changes, these numbers change WITH it, in this
// commit — never silently.

import { decide, rankByVerdict, DecisionInput } from './decision.service';
import {
  DECISION_MIN_OBSERVATION_DAYS,
  DECISION_KILL_REVENUE_FLOOR,
  DECISION_SCALE_REVENUE_THRESHOLD,
  DECISION_SCALE_MIN_ORDERS,
  DECISION_PIVOT_MIN_REVENUE,
  DECISION_PIVOT_MAX_ORDERS,
} from './decision.config';

const LIVE = 'live';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('decide() pinned vectors', () => {
  it('HOLDs a pre-market product instead of inventing a verdict', () => {
    const r = decide({ status: 'draft', revenue: 0, orders: 0, ageDays: 90 });
    expect(r.verdict).toBe('HOLD');
    expect(r.confidence).toBe(0);
    expect(r.reasons[0]).toContain('draft');
  });

  it('HOLDs a live product inside the observation window (launch noise)', () => {
    const r = decide({ status: LIVE, revenue: 5000, orders: 60, ageDays: DECISION_MIN_OBSERVATION_DAYS - 1 });
    expect(r.verdict).toBe('HOLD');
    expect(r.reasons[0]).toContain('observation');
  });

  it('KILLs a full-window product that never cleared the revenue floor', () => {
    const r = decide({ status: LIVE, revenue: 40, orders: 2, ageDays: DECISION_MIN_OBSERVATION_DAYS });
    expect(r.verdict).toBe('KILL');
    expect(r.reasons[0]).toContain('floor');
  });

  it(
    'SCALEs revenue + repeat proof',
    () => {
      const r = decide({ status: LIVE, revenue: DECISION_SCALE_REVENUE_THRESHOLD, orders: DECISION_SCALE_MIN_ORDERS, ageDays: DECISION_MIN_OBSERVATION_DAYS });
      expect(r.verdict).toBe('SCALE');
      expect(r.confidence).toBeGreaterThanOrEqual(80);
    },
  );

  it('PIVOTs when money arrives but too rarely', () => {
    const r = decide({ status: LIVE, revenue: 400, orders: 3, ageDays: DECISION_MIN_OBSERVATION_DAYS });
    expect(r.verdict).toBe('PIVOT');
    expect(r.reasons[0]).toContain('too few');
  });

  it('HOLDs the honest middle: alive, earning, unremarkable', () => {
    const r = decide({ status: LIVE, revenue: 300, orders: 15, ageDays: DECISION_MIN_OBSERVATION_DAYS });
    expect(r.verdict).toBe('HOLD');
    expect(r.reasons[0]).toContain('no rule fired');
  });
});

describe('decide() boundaries', () => {
  it('revenue exactly at the kill floor is NOT killed (strictly below)', () => {
    const r = decide({ status: LIVE, revenue: DECISION_KILL_REVENUE_FLOOR, orders: 1, ageDays: DECISION_MIN_OBSERVATION_DAYS });
    expect(r.verdict).not.toBe('KILL');
  });

  it('a paused product still has market data and can be decided', () => {
    const r = decide({ status: 'paused', revenue: 10, orders: 1, ageDays: 60 });
    expect(r.verdict).toBe('KILL');
  });

  it('scale requires BOTH revenue and order count', () => {
    const richWhale = decide({ status: LIVE, revenue: DECISION_SCALE_REVENUE_THRESHOLD, orders: DECISION_SCALE_MIN_ORDERS - 1, ageDays: 45 });
    expect(richWhale.verdict).not.toBe('SCALE');
  });

  it('is deterministic: identical input, identical full result', () => {
    const input: DecisionInput = { status: LIVE, revenue: 777, orders: 12, ageDays: 40 };
    expect(decide(input)).toEqual(decide(input));
  });
});

describe('decide() invariant sweep (1000 seeded vectors)', () => {
  const rand = mulberry32(424242);
  const vectors: DecisionInput[] = [];
  const statuses = ['draft', 'validating', 'pre_launch', 'live', 'paused', 'discontinued', 'retired'];
  for (let i = 0; i < 1000; i++) {
    vectors.push({
      status: statuses[Math.floor(rand() * statuses.length)],
      revenue: Math.floor(rand() * 3000),
      orders: Math.floor(rand() * 80),
      ageDays: Math.floor(rand() * 120),
    });
  }

  it('never returns an illegal verdict or an out-of-range confidence', () => {
    for (const v of vectors) {
      const r = decide(v);
      expect(['KILL', 'SCALE', 'PIVOT', 'HOLD']).toContain(r.verdict);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(100);
      expect(r.reasons.length).toBeGreaterThan(0);
      expect(r.factors.length).toBeGreaterThan(0);
      expect(typeof r.action).toBe('string');
    }
  });

  it('verdicts never contradict their own rule (rule/output exclusivity)', () => {
    for (const v of vectors) {
      const r = decide(v);
      const decidable = v.status === 'live' || v.status === 'paused';
      const observed = v.ageDays >= DECISION_MIN_OBSERVATION_DAYS;
      if (!decidable || !observed) {
        expect(r.verdict).toBe('HOLD');
        continue;
      }
      if (r.verdict === 'KILL') expect(v.revenue).toBeLessThan(DECISION_KILL_REVENUE_FLOOR);
      if (r.verdict === 'SCALE') {
        expect(v.revenue).toBeGreaterThanOrEqual(DECISION_SCALE_REVENUE_THRESHOLD);
        expect(v.orders).toBeGreaterThanOrEqual(DECISION_SCALE_MIN_ORDERS);
      }
      if (r.verdict === 'PIVOT') {
        expect(v.revenue).toBeGreaterThanOrEqual(DECISION_PIVOT_MIN_REVENUE);
        expect(v.orders).toBeLessThanOrEqual(DECISION_PIVOT_MAX_ORDERS);
      }
      if (r.verdict === 'HOLD') {
        expect(v.revenue).toBeGreaterThanOrEqual(DECISION_KILL_REVENUE_FLOOR);
      }
    }
  });
});

describe('rankByVerdict()', () => {
  it('orders the portfolio actionables-first: SCALE, KILL, PIVOT, HOLD', () => {
    const items = [
      { id: 1, v: 'HOLD' as const },
      { id: 2, v: 'SCALE' as const },
      { id: 3, v: 'KILL' as const },
      { id: 4, v: 'PIVOT' as const },
    ];
    const ranked = rankByVerdict(items, x => x.v);
    expect(ranked.map(x => x.v)).toEqual(['SCALE', 'KILL', 'PIVOT', 'HOLD']);
  });
});