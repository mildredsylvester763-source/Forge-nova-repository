// ============================================================================
// FILE: /apps/api/src/modules/ai-training/engine/eval-gate-engine.spec.ts
// ============================================================================
// Pinned law tests for the AI-021..024 eval harness engine. Every refusal is
// asserted by exact name; every happy path by exact value. Order-independence
// is pinned by all-permutations sweeps; robustness by a 500-case
// mulberry32(seed 42) sweep. The fingerprint law pins: identical content =>
// identical fingerprint, key-order independent, version-insensitive (version
// is metadata), case-order sensitive (case order is content).

import {
  defineEvalSuite,
  suiteFingerprint,
  gradeSuite,
  aggregatePanel,
  applyRegressionGate,
  type EvalSuite,
  type EvalCase,
  type PanelVote,
  type RegressionGate,
} from './eval-gate-engine';

// Verdict is a discriminated union: never touch .reason/.value directly.
const reasonOf = <T>(v: { ok: true; value: T } | { ok: false; reason: string }): string =>
  v.ok ? 'UNEXPECTED-OK' : v.reason;
const valueOf = <T>(v: { ok: true; value: T } | { ok: false; reason: string }): T => {
  if (!v.ok) {
    throw new Error('expected ok, got ' + v.reason);
  }
  return v.value;
};

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const FIX1: EvalCase = {
  id: 'fix1',
  domain: 'code-fix',
  criteria: ['compiles', 'tests-pass'],
  weight: 2,
};
const REV1: EvalCase = {
  id: 'rev1',
  domain: 'code-review',
  criteria: ['severity', 'tone'],
};
const SUITE: EvalSuite = {
  id: 'forge-core',
  version: 1,
  kind: 'forge',
  cases: [FIX1, REV1],
};

describe('defineEvalSuite (AI-021) — named refusals', () => {
  it('refuses a suite without an id', () => {
    expect(reasonOf(defineEvalSuite({ ...SUITE, id: '' }))).toBe('suite-no-id');
  });
  it('refuses an invalid version', () => {
    expect(reasonOf(defineEvalSuite({ ...SUITE, version: 0 }))).toBe('suite-invalid-version');
  });
  it('refuses an unknown kind', () => {
    expect(reasonOf(defineEvalSuite({ ...SUITE, kind: 'other' as never }))).toBe('suite-no-kind');
  });
  it('refuses a suite with no cases', () => {
    expect(reasonOf(defineEvalSuite({ ...SUITE, cases: [] }))).toBe('suite-no-cases');
  });
  it('refuses duplicate case ids (double-tap)', () => {
    expect(
      reasonOf(defineEvalSuite({ ...SUITE, cases: [FIX1, { ...FIX1 }] })),
    ).toBe('suite-duplicate-case:fix1');
  });
  it('refuses a case without an id', () => {
    expect(reasonOf(defineEvalSuite({ ...SUITE, cases: [{ ...FIX1, id: '' }] }))).toBe('suite-case-invalid');
  });
  it('refuses a case with a domain outside its kind', () => {
    expect(
      reasonOf(defineEvalSuite({ ...SUITE, cases: [{ ...FIX1, domain: 'cooking' as never }] })),
    ).toBe('suite-case-invalid-domain:fix1:cooking');
  });
  it('refuses a forge case without criteria', () => {
    expect(
      reasonOf(defineEvalSuite({ ...SUITE, cases: [{ ...REV1, criteria: [] }] })),
    ).toBe('suite-case-no-criteria:rev1');
  });
  it('refuses an invalid criterion', () => {
    expect(
      reasonOf(defineEvalSuite({ ...SUITE, cases: [{ ...FIX1, criteria: ['compiles', ''] }] })),
    ).toBe('suite-case-invalid-criterion:fix1');
  });
  it('refuses a duplicate criterion', () => {
    expect(
      reasonOf(defineEvalSuite({ ...SUITE, cases: [{ ...FIX1, criteria: ['compiles', 'compiles'] }] })),
    ).toBe('suite-case-duplicate-criterion:fix1/compiles');
  });
  it('refuses an invalid weight', () => {
    expect(reasonOf(defineEvalSuite({ ...SUITE, cases: [{ ...FIX1, weight: 0 }] }))).toBe(
      'suite-case-invalid-weight:fix1',
    );
  });
  it('admits a creative case with no criteria (criteria are a forge law)', () => {
    const v = valueOf(
      defineEvalSuite({ id: 'art-1', version: 1, kind: 'creative', cases: [{ id: 'm1', domain: 'manhwa', criteria: [] }] }),
    );
    expect(v.cases).toEqual([{ id: 'm1', domain: 'manhwa', criteria: [] }]);
  });
  it('returns a deep copy: mutating the input never corrupts the suite', () => {
    const a = defineEvalSuite(SUITE);
    const fp1 = valueOf(suiteFingerprint(valueOf(a)));
    SUITE.cases[0].criteria.push('injected');
    const fp2 = valueOf(suiteFingerprint(valueOf(a)));
    expect(fp2).toBe(fp1);
    SUITE.cases[0].criteria.pop();
  });
});

describe('suiteFingerprint (AI-021) — the fingerprint law', () => {
  it('fingerprints content: key-order independent, version-insensitive, case-order and criteria sensitive', () => {
    const a = defineEvalSuite(SUITE);
    expect(a.ok).toBe(true);
    const fp1 = valueOf(suiteFingerprint(valueOf(a)));
    const fp2 = valueOf(
      suiteFingerprint({
        kind: 'forge',
        cases: [
          { weight: 2, criteria: ['compiles', 'tests-pass'], id: 'fix1', domain: 'code-fix' },
          { criteria: ['severity', 'tone'], id: 'rev1', domain: 'code-review' },
        ],
        version: 1,
        id: 'forge-core',
      }),
    );
    expect(fp2).toBe(fp1);
    // version is metadata, NOT content: same content, higher version, same fingerprint
    const fp3 = valueOf(suiteFingerprint({ ...valueOf(a), version: 2 }));
    expect(fp3).toBe(fp1);
    // case order is content
    const fp4 = valueOf(suiteFingerprint({ ...valueOf(a), cases: [REV1, FIX1] }));
    expect(fp4).not.toBe(fp1);
    // criteria are content
    const fp5 = valueOf(
      suiteFingerprint({ ...valueOf(a), cases: [{ ...FIX1, criteria: ['compiles'] }, REV1] }),
    );
    expect(fp5).not.toBe(fp1);
  });
  it('refuses a non-suite', () => {
    expect(reasonOf(suiteFingerprint({} as never))).toBe('suite-no-cases');
  });
});

describe('gradeSuite (AI-022) — criteria grading', () => {
  it('refuses a missing suite', () => {
    expect(reasonOf(gradeSuite(null as never, {}))).toBe('grade-no-suite');
  });
  it('refuses to criteria-grade a creative suite', () => {
    const creative = defineEvalSuite({
      id: 'art-1',
      version: 1,
      kind: 'creative',
      cases: [{ id: 'm1', domain: 'manhwa', criteria: [] }],
    });
    expect(reasonOf(gradeSuite(valueOf(creative), {}))).toBe('grade-creative-not-criteria');
  });
  it('refuses missing results', () => {
    expect(reasonOf(gradeSuite(SUITE, null as never))).toBe('grade-no-results');
  });
  it('refuses a result for an unknown case', () => {
    expect(reasonOf(gradeSuite(SUITE, { ghost: [] }))).toBe('grade-case-unknown:ghost');
  });
  it('refuses a missing result for a suite case', () => {
    expect(reasonOf(gradeSuite(SUITE, { fix1: [] }))).toBe('grade-case-missing:rev1');
  });
  it('refuses a malformed result', () => {
    expect(reasonOf(gradeSuite(SUITE, { fix1: 'nope' as never, rev1: [] }))).toBe(
      'grade-result-invalid:fix1',
    );
  });
  it('refuses an unknown criterion', () => {
    expect(reasonOf(gradeSuite(SUITE, { fix1: ['hack'], rev1: [] }))).toBe(
      'grade-criterion-unknown:fix1/hack',
    );
  });
  it('refuses a duplicate criterion (double-tap)', () => {
    expect(reasonOf(gradeSuite(SUITE, { fix1: ['compiles', 'compiles'], rev1: [] }))).toBe(
      'grade-criterion-duplicate:fix1/compiles',
    );
  });
  it('grades a weighted mean of per-case criteria pass rates', () => {
    const v = valueOf(gradeSuite(SUITE, { fix1: ['compiles', 'tests-pass'], rev1: ['severity'] }));
    expect(v).toEqual({ perCase: { fix1: 1, rev1: 0.5 }, score: 0.833333 });
  });
  it('is deterministic under any results key serialization order', () => {
    const r1: Record<string, string[]> = {};
    r1['fix1'] = ['compiles'];
    r1['rev1'] = ['severity', 'tone'];
    const r2: Record<string, string[]> = {};
    r2['rev1'] = ['severity', 'tone'];
    r2['fix1'] = ['compiles'];
    expect(JSON.stringify(valueOf(gradeSuite(SUITE, r2)))).toBe(JSON.stringify(valueOf(gradeSuite(SUITE, r1))));
  });
});

describe('aggregatePanel (AI-023) — quorum-gated median', () => {
  it('refuses missing votes', () => {
    expect(reasonOf(aggregatePanel(null as never, 1))).toBe('panel-no-votes');
  });
  it('refuses an invalid quorum', () => {
    expect(reasonOf(aggregatePanel([{ panelist: 'p1', score: 50 }], 0))).toBe('panel-invalid-quorum');
  });
  it('refuses a duplicate panelist (double-tap)', () => {
    expect(
      reasonOf(
        aggregatePanel(
          [
            { panelist: 'p1', score: 50 },
            { panelist: 'p1', score: 60 },
          ],
          1,
        ),
      ),
    ).toBe('panel-duplicate-panelist:p1');
  });
  it('refuses an out-of-range score', () => {
    expect(reasonOf(aggregatePanel([{ panelist: 'p1', score: 101 }], 1))).toBe('panel-invalid-score:p1');
  });
  it('refuses an unmet quorum by name', () => {
    expect(
      reasonOf(
        aggregatePanel(
          [
            { panelist: 'p1', score: 50 },
            { panelist: 'p2', score: 60 },
          ],
          3,
        ),
      ),
    ).toBe('panel-quorum-unmet:2<3');
  });
  it('median of an odd panel is the exact middle score', () => {
    expect(
      valueOf(
        aggregatePanel(
          [
            { panelist: 'p1', score: 30 },
            { panelist: 'p2', score: 20 },
            { panelist: 'p3', score: 10 },
          ],
          2,
        ),
      ),
    ).toEqual({ median: 20, count: 3 });
  });
  it('median of an even panel is the mean of the middle pair', () => {
    expect(
      valueOf(
        aggregatePanel(
          [
            { panelist: 'p1', score: 10 },
            { panelist: 'p2', score: 25 },
          ],
          2,
        ),
      ),
    ).toEqual({ median: 17.5, count: 2 });
  });
  it('is order-independent across ALL serialization orderings of the same votes', () => {
    const votes: PanelVote[] = [
      { panelist: 'p1', score: 40 },
      { panelist: 'p2', score: 70 },
      { panelist: 'p3', score: 55 },
      { panelist: 'p4', score: 90 },
    ];
    const first = JSON.stringify(valueOf(aggregatePanel(votes, 3)));
    const perms = (arr: PanelVote[]): PanelVote[][] => {
      if (arr.length <= 1) {
        return [arr];
      }
      const out: PanelVote[][] = [];
      for (let i = 0; i < arr.length; i++) {
        const rest = arr.slice(0, i).concat(arr.slice(i + 1));
        for (const p of perms(rest)) {
          out.push([arr[i]].concat(p));
        }
      }
      return out;
    };
    for (const p of perms(votes)) {
      expect(JSON.stringify(valueOf(aggregatePanel(p, 3)))).toBe(first);
    }
  });
});

describe('applyRegressionGate (AI-024) — a model cannot ship below thresholds', () => {
  const GATE: RegressionGate = {
    thresholds: {
      accuracy: { min: 0.9, baseline: 0.95, maxDrop: 0.05 },
      latency: { min: 100 },
    },
  };
  it('refuses missing metrics', () => {
    expect(reasonOf(applyRegressionGate(null as never, GATE))).toBe('gate-no-metrics');
  });
  it('refuses missing thresholds', () => {
    expect(reasonOf(applyRegressionGate({ accuracy: 0.9 }, null as never))).toBe('gate-no-thresholds');
  });
  it('refuses a metric without a threshold', () => {
    expect(
      reasonOf(applyRegressionGate({ accuracy: 0.9, latency: 120 }, { thresholds: { accuracy: { min: 0.8 } } })),
    ).toBe('gate-missing-threshold:latency');
  });
  it('refuses an unmeasured threshold', () => {
    expect(
      reasonOf(
        applyRegressionGate(
          { accuracy: 0.9 },
          { thresholds: { accuracy: { min: 0.8 }, latency: { min: 50 } } },
        ),
      ),
    ).toBe('gate-unmeasured-metric:latency');
  });
  it('refuses an invalid minimum', () => {
    expect(
      reasonOf(applyRegressionGate({ accuracy: 0.9 }, { thresholds: { accuracy: { min: -1 } } })),
    ).toBe('gate-invalid-minimum:accuracy');
  });
  it('refuses a regression threshold missing its pair', () => {
    expect(
      reasonOf(applyRegressionGate({ accuracy: 0.9 }, { thresholds: { accuracy: { baseline: 0.95 } } })),
    ).toBe('gate-incomplete-regression:accuracy');
  });
  it('refuses an invalid baseline', () => {
    expect(
      reasonOf(
        applyRegressionGate({ accuracy: 0.9 }, { thresholds: { accuracy: { baseline: Number.NaN, maxDrop: 0.05 } } }),
      ),
    ).toBe('gate-invalid-baseline:accuracy');
  });
  it('refuses an invalid max drop', () => {
    expect(
      reasonOf(
        applyRegressionGate({ accuracy: 0.9 }, { thresholds: { accuracy: { baseline: 0.95, maxDrop: -1 } } }),
      ),
    ).toBe('gate-invalid-max-drop:accuracy');
  });
  it('refuses an invalid score', () => {
    expect(
      reasonOf(applyRegressionGate({ accuracy: Number.NaN }, { thresholds: { accuracy: { min: 0.9 } } })),
    ).toBe('gate-invalid-score:accuracy');
  });
  it('passes metrics above all thresholds', () => {
    expect(valueOf(applyRegressionGate({ accuracy: 0.92, latency: 120 }, GATE))).toEqual({
      passed: ['accuracy', 'latency'],
    });
  });
  it('names every failure and joins them with a semicolon — none dropped', () => {
    const v = applyRegressionGate({ accuracy: 0.85, latency: 120 }, GATE);
    expect(reasonOf(v)).toBe('gate-below-minimum:accuracy:0.85<0.9; gate-regression:accuracy:-0.1000>0.05');
  });
  it('is deterministic under any metrics/thresholds key serialization order', () => {
    const m1: Record<string, number> = {};
    m1['accuracy'] = 0.85;
    m1['latency'] = 120;
    const t1: Record<string, { min?: number; baseline?: number; maxDrop?: number }> = {};
    t1['accuracy'] = GATE.thresholds['accuracy'];
    t1['latency'] = GATE.thresholds['latency'];
    const m2: Record<string, number> = {};
    m2['latency'] = 120;
    m2['accuracy'] = 0.85;
    const t2: Record<string, { min?: number; baseline?: number; maxDrop?: number }> = {};
    t2['latency'] = GATE.thresholds['latency'];
    t2['accuracy'] = GATE.thresholds['accuracy'];
    expect(reasonOf(applyRegressionGate(m2, { thresholds: t2 }))).toBe(
      reasonOf(applyRegressionGate(m1, { thresholds: t1 })),
    );
  });
});

describe('pinned 500-case sweep (mulberry32 seed 42)', () => {
  it('holds grading, panel and gate invariants across 500 random cases', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      // --- grading ---
      const nCases = 2 + Math.floor(rnd() * 4);
      const cases: EvalCase[] = [];
      for (let c = 0; c < nCases; c++) {
        const nCrit = 1 + Math.floor(rnd() * 4);
        const criteria: string[] = [];
        for (let k = 0; k < nCrit; k++) {
          criteria.push('crit-' + c + '-' + k);
        }
        cases.push({ id: 'case-' + c, criteria, weight: 1 + Math.floor(rnd() * 3) });
      }
      const results: Record<string, string[]> = {};
      let wSum = 0;
      let wPass = 0;
      for (const c of cases) {
        const passed = c.criteria.filter(() => rnd() < 0.5);
        results[c.id] = passed;
        const per = Math.round((passed.length / c.criteria.length) * 1e6) / 1e6;
        const w = c.weight ?? 1;
        wSum += w;
        wPass += w * per;
      }
      const suite: EvalSuite = { id: 'sweep-' + i, version: 1, kind: 'forge', cases };
      const def = defineEvalSuite(suite);
      expect(def.ok).toBe(true);
      const g = valueOf(gradeSuite(valueOf(def), results));
      expect(g.score).toBeGreaterThanOrEqual(0);
      expect(g.score).toBeLessThanOrEqual(1);
      expect(g.score).toBe(Math.round((wPass / wSum) * 1e6) / 1e6);
      // --- panel ---
      const nVotes = 1 + Math.floor(rnd() * 8);
      const votes: PanelVote[] = [];
      const scores: number[] = [];
      for (let v = 0; v < nVotes; v++) {
        const s = Math.floor(rnd() * 101);
        votes.push({ panelist: 'v' + v, score: s });
        scores.push(s);
      }
      const quorum = 1 + Math.floor(rnd() * nVotes);
      const p = valueOf(aggregatePanel(votes, quorum));
      expect(p.count).toBe(nVotes);
      const sorted = scores.slice().sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const expectedMedian =
        sorted.length % 2 === 1
          ? sorted[mid]
          : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
      expect(p.median).toBe(expectedMedian);
      expect(p.median).toBeGreaterThanOrEqual(sorted[0]);
      expect(p.median).toBeLessThanOrEqual(sorted[sorted.length - 1]);
      // --- ship gate ---
      const nMetrics = 1 + Math.floor(rnd() * 4);
      const metrics: Record<string, number> = {};
      const thresholds: Record<string, { min?: number; baseline?: number; maxDrop?: number }> = {};
      for (let m = 0; m < nMetrics; m++) {
        const name = 'm-' + m;
        metrics[name] = Math.round(rnd() * 100) / 100;
        const th: { min?: number; baseline?: number; maxDrop?: number } = { min: Math.round(rnd() * 100) / 100 };
        if (rnd() < 0.5) {
          th.baseline = Math.round(rnd() * 100) / 100;
          th.maxDrop = Math.round(rnd() * 100) / 100;
        }
        thresholds[name] = th;
      }
      const gate = applyRegressionGate(metrics, { thresholds });
      if (gate.ok) {
        expect(gate.value.passed).toEqual(Object.keys(metrics).sort());
      } else {
        expect(gate.reason).toContain('gate-');
      }
    }
  });
});
