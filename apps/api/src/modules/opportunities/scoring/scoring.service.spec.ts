// ============================================================================
// FILE: /apps/api/src/modules/opportunities/scoring/scoring.service.spec.ts
// ============================================================================
// The validation ladder, in order:
//   1. Hand-computed vectors pin the math.
//   2. Property invariants: composite always finite and in [0, 100].
//   3. Baseline comparison: scored ranking must beat newest-first.
//   4. Sensitivity: raising any sub-score raises the composite.
// All randomness is seeded — the suite is deterministic and replayable.

import { computeScore, gradeFor, normalizeSubScore, rankByScore } from './scoring.service';
import { COMPOSITE_MAX, DEFAULT_SUB_SCORE, SUB_SCORE_MAX } from './scoring.config';

const all = (n: number) => ({
  demand: n, competition: n, profitability: n,
  feasibility: n, trend: n, seasonality: n,
});

describe('ScoringEngine', () => {
  describe('hand-computed vectors (the math is pinned)', () => {
    it('scores a perfect opportunity 100 / A / PURSUE_NOW', () => {
      const r = computeScore(all(10));
      expect(r.composite).toBe(100);
      expect(r.grade).toBe('A');
      expect(r.action).toBe('PURSUE_NOW');
    });

    it('scores a zero opportunity 0 / D / KILL', () => {
      const r = computeScore(all(0));
      expect(r.composite).toBe(0);
      expect(r.grade).toBe('D');
      expect(r.action).toBe('KILL');
    });

    it('pins the weighted vector: demand 10, rest 5 → exactly 62.5 / B', () => {
      const r = computeScore({ ...all(5), demand: 10 });
      expect(r.composite).toBe(62.5);
      expect(r.grade).toBe('B');
      expect(r.action).toBe('VALIDATE');
    });

    it('weights sum to 1: a neutral board scores exactly 50', () => {
      expect(computeScore(all(5)).composite).toBe(50);
    });
  });

  describe('missing signals degrade visibly, never silently', () => {
    it('defaults omitted signals and lists them in missingSignals', () => {
      const r = computeScore({ demand: 10 });
      expect(r.missingSignals).toEqual(['competition', 'profitability', 'feasibility', 'trend', 'seasonality']);
      expect(r.factors.filter(f => f.source === 'defaulted')).toHaveLength(5);
      expect(r.factors.find(f => f.key === 'demand')?.source).toBe('provided');
    });

    it('treats NaN like a missing signal', () => {
      const r = computeScore({ demand: Number.NaN });
      expect(r.missingSignals).toContain('demand');
      expect(r.factors.find(f => f.key === 'demand')?.value).toBe(DEFAULT_SUB_SCORE);
    });

    it('keeps a fully-empty board valid: 50 / C / PARK', () => {
      const r = computeScore({});
      expect(r.composite).toBe(50);
      expect(r.grade).toBe('C');
    });
  });

  describe('bounded inputs, bounded outputs', () => {
    it('clamps sub-scores into [0, 10] before weighting', () => {
      expect(normalizeSubScore(999)).toBe(SUB_SCORE_MAX);
      expect(normalizeSubScore(-3)).toBe(0);
      expect(computeScore(all(999)).composite).toBe(COMPOSITE_MAX);
    });
  });

  describe('grade boundaries are exact', () => {
    it('cuts at 75 / 60 / 40 with no gaps', () => {
      expect(gradeFor(75).grade).toBe('A');
      expect(gradeFor(74.99).grade).toBe('B');
      expect(gradeFor(60).grade).toBe('B');
      expect(gradeFor(59.99).grade).toBe('C');
      expect(gradeFor(40).grade).toBe('C');
      expect(gradeFor(39.99).grade).toBe('D');
    });
  });

  describe('deterministic and replayable', () => {
    it('returns identical results for identical inputs', () => {
      const input = { demand: 7, competition: 3, profitability: 8 };
      expect(computeScore(input)).toEqual(computeScore(input));
    });

    it('holds composite in [0, 100] across a 1000-vector seeded sweep', () => {
      let seed = 42;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      for (let i = 0; i < 1000; i++) {
        const r = computeScore({
          demand: rand() * 20 - 5,
          competition: rand() * 20 - 5,
          profitability: rand() * 20 - 5,
          feasibility: rand() * 20 - 5,
          trend: rand() * 20 - 5,
          seasonality: rand() * 20 - 5,
        });
        expect(Number.isFinite(r.composite)).toBe(true);
        expect(r.composite).toBeGreaterThanOrEqual(0);
        expect(r.composite).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('sensitivity: outputs move the way domain logic says', () => {
    it('raising demand raises the composite', () => {
      const low = computeScore(all(5)).composite;
      const high = computeScore({ ...all(5), demand: 9 }).composite;
      expect(high).toBeGreaterThan(low);
    });

    it('every factor has positive weight — no dead inputs', () => {
      const base = computeScore(all(5)).composite;
      const others = ['competition', 'profitability', 'feasibility', 'trend', 'seasonality'] as const;
      for (const key of others) {
        const moved = computeScore({ ...all(5), [key]: 10 }).composite;
        expect(moved).toBeGreaterThan(base);
      }
    });
  });

  describe('baseline comparison: beats newest-first', () => {
    it('ranks a high-signal older opportunity above a newer weak one', () => {
      const opportunities = [
        { id: 'new-weak', createdAt: '2026-10-06' },   // newest — the naive baseline picks this
        { id: 'old-strong', createdAt: '2026-09-01' }, // older but far better
      ];
      const scoreOf = (o: any) =>
        o.id === 'old-strong'
          ? computeScore({ ...all(6), demand: 9 }).composite // 67.5
          : computeScore(all(3)).composite;                  // 30
      const ranked = rankByScore(opportunities, scoreOf);
      expect(ranked[0].id).toBe('old-strong');
    });
  });

  describe('explainability: the score says why', () => {
    it('reports six factors whose contributions sum to composite/10', () => {
      const r = computeScore({ demand: 8, profitability: 6 });
      expect(r.factors).toHaveLength(6);
      const sum = r.factors.reduce((acc, f) => acc + f.contribution, 0);
      expect(Math.round(sum * 10 * 100) / 100).toBe(r.composite);
      expect(r.reason).toBeTruthy();
    });
  });
});
