// ============================================================================
// FILE: /apps/api/src/modules/ai-training/engine/eval-gate-engine.spec.ts
// ============================================================================
// Laws for the eval harness (AI-021..024): pinned boundary vectors, a 500-case
// mulberry32(seed 42) sweep, and adversarial scenarios — the same input under
// EVERY serialization order must give the SAME verdict; duplicates are refused
// by name; gates name every failure; quorums are hard boundaries.

import {
  EvalCase,
  EvalSuite,
  GateThreshold,
  PanelVote,
  RegressionGate,
  aggregatePanel,
  applyRegressionGate,
  defineEvalSuite,
  gradeSuite,
  suiteFingerprint,
} from './eval-gate-engine';

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** All orderings of n items — the serialization orders a payload/DB can pick. */
function orderings<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const tail of orderings(rest)) out.push([items[i], ...tail]);
  }
  return out;
}

const FIX1: EvalCase = { id: 'fix1', criteria: ['compiles', 'tests-pass'], weight: 2 };
const REV1: EvalCase = { id: 'rev1', criteria: ['severity', 'tone'] };
const SUITE: EvalSuite = { id: 'forge-core', version: 1, kind: 'forge', cases: [FIX1, REV1] };

describe('AI-021 versioned benchmark suites', () => {
  it('refuses malformed suites by name (pinned boundary vectors)', () => {
    expect(defineEvalSuite(null as unknown as EvalSuite).reason).toBe('suite-no-id');
    expect(defineEvalSuite({ ...SUITE, version: 0, cases: [FIX1] }).reason).toBe('suite-invalid-version');
    expect(defineEvalSuite({ ...SUITE, kind: 'weird' as EvalSuite['kind'] }).reason).toBe('suite-no-kind');
    expect(defineEvalSuite({ ...SUITE, cases: [] }).reason).toBe('suite-no-cases');
    expect(defineEvalSuite({ ...SUITE, cases: [FIX1, { ...FIX1 }] }).reason).toBe('suite-duplicate-case:fix1');
    expect(defineEvalSuite({ ...SUITE, cases: [{ id: 'c1', criteria: [] }] }).reason).toBe('suite-case-no-criteria:c1');
    expect(defineEvalSuite({ ...SUITE, cases: [{ ...FIX1, weight: 0 }] }).reason).toBe('suite-case-invalid-weight:fix1');
    expect(defineEvalSuite({ ...SUITE, cases: [{ ...FIX1, domain: 'manhwa' }] }).reason).toBe('suite-case-invalid-domain:fix1:manhwa');
    expect(defineEvalSuite({ id: 'art', version: 1, kind: 'creative', cases: [{ id: 'm1', domain: 'manhwa', criteria: [] }] }).ok).toBe(true);
    expect(defineEvalSuite({ id: 'art', version: 1, kind: 'creative', cases: [{ id: 'm1', domain: 'code-fix', criteria: [] }] }).reason).toBe('suite-case-invalid-domain:m1:code-fix');
  });

  it('fingerprints content: key-order independent, version and case-order sensitive', () => {
    const a = defineEvalSuite(SUITE);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const fp1 = suiteFingerprint(a.value);
    expect(fp1.ok).toBe(true);
    if (!fp1.ok) return;
    const fp2 = suiteFingerprint({ kind: 'forge', cases: [{ weight: 2, criteria: ['compiles', 'tests-pass'], id: 'fix1' }, { criteria: ['severity', 'tone'], id: 'rev1' }], version: 1, id: 'forge-core' });
    expect(fp2.ok).toBe(true);
    if (!fp2.ok) return;
    expect(fp2.value).toBe(fp1.value);
    const fp3 = suiteFingerprint({ ...a.value, version: 2 });
    expect(fp3.ok).toBe(true);
    if (!fp3.ok) return;
    expect(fp3.value).not.toBe(fp1.value);
    const fp4 = suiteFingerprint({ ...a.value, cases: [REV1, FIX1] });
    expect(fp4.ok).toBe(true);
    if (!fp4.ok) return;
    expect(fp4.value).not.toBe(fp1.value);
  });
});

describe('AI-022 FORGE benchmark grading', () => {
  it('grades weighted criteria and refuses bad result maps by name (pinned vectors)', () => {
    const s = defineEvalSuite(SUITE);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(gradeSuite(s.value, { nope: [] } as Record<string, string[]>).reason).toBe('grade-case-unknown:nope');
    expect(gradeSuite(s.value, { fix1: ['compiles'] } as Record<string, string[]>).reason).toBe('grade-case-missing:rev1');
    expect(gradeSuite(s.value, { fix1: ['compiles', 'nope'], rev1: [] }).reason).toBe('grade-criterion-unknown:fix1/nope');
    expect(gradeSuite(s.value, { fix1: ['compiles', 'compiles'], rev1: [] }).reason).toBe('grade-criterion-duplicate:fix1/compiles');
    expect(gradeSuite(s.value, { fix1: ['compiles', 'tests-pass'], rev1: ['severity', 'tone'] }).value?.score).toBe(1);
    expect(gradeSuite(s.value, { fix1: [], rev1: [] }).value?.score).toBe(0);
    // fix1 weight 2: (2*0.5 + 1*0) / 3 = 0.333333
    expect(gradeSuite(s.value, { fix1: ['compiles'], rev1: [] }).value?.score).toBe(0.333333);
  });

  it('refuses creative suites at the criteria gate by name', () => {
    const s = defineEvalSuite({ id: 'art', version: 1, kind: 'creative', cases: [{ id: 'm1', domain: 'voice', criteria: [] }] });
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(gradeSuite(s.value, { m1: [] }).reason).toBe('grade-creative-not-criteria');
  });
});

describe('AI-023 human panels', () => {
  const votes: PanelVote[] = [
    { panelist: 'a', score: 10 },
    { panelist: 'b', score: 50 },
    { panelist: 'c', score: 90 },
  ];

  it('refuses malformed panels by name and gates the quorum as a hard boundary (pinned vectors)', () => {
    expect(aggregatePanel(null as unknown as PanelVote[], 1).reason).toBe('panel-no-votes');
    expect(aggregatePanel(votes, 0).reason).toBe('panel-invalid-quorum');
    expect(aggregatePanel([{ panelist: 'a', score: 50 }], 2).reason).toBe('panel-quorum-unmet:1<2');
    expect(aggregatePanel([{ panelist: 'a', score: 101 }], 1).reason).toBe('panel-invalid-score:a');
    expect(aggregatePanel([{ panelist: 'a', score: 50 }, { panelist: 'a', score: 60 }], 1).reason).toBe('panel-duplicate-panelist:a');
    expect(aggregatePanel(votes, 3).value?.median).toBe(50);
    const even = aggregatePanel(
      [
        { panelist: 'a', score: 10 },
        { panelist: 'b', score: 50 },
        { panelist: 'c', score: 60 },
        { panelist: 'd', score: 90 },
      ],
      4,
    );
    expect(even.value?.median).toBe(55);
    // quorum boundary: exactly quorum passes, one fewer is refused by name
    expect(aggregatePanel(votes, 3).ok).toBe(true);
    expect(aggregatePanel(votes.slice(0, 2), 3).reason).toBe('panel-quorum-unmet:2<3');
  });

  it('SCENARIO panel votes arriving in ANY order give the identical median (all permutations)', () => {
    const four: PanelVote[] = [
      { panelist: 'a', score: 40 },
      { panelist: 'b', score: 80 },
      { panelist: 'c', score: 60 },
      { panelist: 'd', score: 100 },
    ];
    const base = aggregatePanel(four, 4);
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    for (const order of orderings(four)) {
      const r = aggregatePanel(order, 4);
      expect(r.ok).toBe(true);
      expect(r.value?.median).toBe(base.value.median);
      expect(r.value?.count).toBe(4);
    }
  });

  it('SCENARIO double-tap panel vote: the duplicate panelist is refused by name in every ordering', () => {
    const pair: PanelVote[] = [
      { panelist: 'a', score: 50 },
      { panelist: 'a', score: 70 },
    ];
    for (const order of orderings(pair)) {
      expect(aggregatePanel(order, 1).reason).toBe('panel-duplicate-panelist:a');
    }
  });
});

describe('AI-024 regression gates', () => {
  it('refuses malformed gates by name and pins boundary behavior (pinned vectors)', () => {
    expect(applyRegressionGate(null as unknown as Record<string, number>, { thresholds: {} }).reason).toBe('gate-no-metrics');
    expect(applyRegressionGate({ accuracy: 0.9 }, null as unknown as RegressionGate).reason).toBe('gate-no-thresholds');
    expect(applyRegressionGate({ accuracy: 0.9 }, { thresholds: {} }).reason).toBe('gate-missing-threshold:accuracy');
    expect(applyRegressionGate({ accuracy: 0.9 }, { thresholds: { accuracy: { min: 0.9 }, tone: { min: 0.8 } } }).reason).toBe('gate-unmeasured-metric:tone');
    expect(applyRegressionGate({ accuracy: 0.9 }, { thresholds: { accuracy: { min: 0.9, baseline: 1.0 } } }).reason).toBe('gate-incomplete-regression:accuracy');
    expect(applyRegressionGate({ accuracy: 0.9 }, { thresholds: { accuracy: { baseline: 1.0, maxDrop: -1 } } }).reason).toBe('gate-invalid-max-drop:accuracy');
    expect(applyRegressionGate({ accuracy: 0.89 }, { thresholds: { accuracy: { min: 0.9 } } }).reason).toBe('gate-below-minimum:accuracy:0.89<0.9');
    expect(applyRegressionGate({ accuracy: 0.9 }, { thresholds: { accuracy: { min: 0.9 } } }).ok).toBe(true);
    expect(applyRegressionGate({ accuracy: 0.9 }, { thresholds: { accuracy: { baseline: 1.0, maxDrop: 0.05 } } }).reason).toBe('gate-regression:accuracy:-0.1000>0.05');
    expect(applyRegressionGate({ accuracy: 0.95 }, { thresholds: { accuracy: { baseline: 1.0, maxDrop: 0.05 } } }).ok).toBe(true);
  });

  it('SCENARIO multi-metric failure: every failing metric is named, none dropped', () => {
    const r = applyRegressionGate(
      { accuracy: 0.5, tone: 0.4, latency: 0.99 },
      { thresholds: { accuracy: { min: 0.9 }, tone: { min: 0.8 }, latency: { min: 0.9 } } },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('gate-below-minimum:accuracy:0.5<0.9');
    expect(r.reason).toContain('gate-below-minimum:tone:0.4<0.8');
    expect(r.reason).not.toContain('latency');
  });

  it('SCENARIO gate verdict is identical under every serialization order of the metrics payload', () => {
    const keys = ['accuracy', 'tone', 'latency'];
    const values: Record<string, number> = { accuracy: 0.5, tone: 0.4, latency: 0.99 };
    const gate: RegressionGate = { thresholds: { accuracy: { min: 0.9 }, tone: { min: 0.8 }, latency: { min: 0.9 } } };
    let first: string | null = null;
    for (const order of orderings(keys)) {
      const payload: Record<string, number> = {};
      for (const k of order) payload[k] = values[k];
      const r = applyRegressionGate(payload, gate);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      if (first === null) first = r.reason;
      expect(r.reason).toBe(first);
    }
  });
});

describe('purity and sweeps', () => {
  it('SCENARIO double-apply is a no-op: every law is pure (same input, same verdict)', () => {
    const s = defineEvalSuite(SUITE);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const g1 = gradeSuite(s.value, { fix1: ['compiles'], rev1: ['severity'] });
    const g2 = gradeSuite(s.value, { fix1: ['compiles'], rev1: ['severity'] });
    expect(JSON.stringify(g1)).toBe(JSON.stringify(g2));
    const v: PanelVote[] = [{ panelist: 'a', score: 10 }, { panelist: 'b', score: 50 }];
    expect(JSON.stringify(aggregatePanel(v, 2))).toBe(JSON.stringify(aggregatePanel(v, 2)));
    const gate: RegressionGate = { thresholds: { m: { min: 0.5 } } };
    expect(JSON.stringify(applyRegressionGate({ m: 0.4 }, gate))).toBe(JSON.stringify(applyRegressionGate({ m: 0.4 }, gate)));
  });

  it('sweep: 500 randomized suites grade in [0,1], monotonic, and gate-consistent (mulberry32 seed 42)', () => {
    const rnd = mulberry32(42);
    for (let n = 0; n < 500; n++) {
      const nc = 1 + Math.floor(rnd() * 4);
      const cases: EvalCase[] = [];
      for (let i = 0; i < nc; i++) {
        const critCount = 1 + Math.floor(rnd() * 3);
        cases.push({ id: 'c' + i, criteria: Array.from({ length: critCount }, (_, j) => 'k' + j) });
      }
      const suite = defineEvalSuite({ id: 'sw', version: 1, kind: 'forge', cases });
      expect(suite.ok).toBe(true);
      if (!suite.ok) continue;
      const results: Record<string, string[]> = {};
      for (const c of suite.value.cases) {
        results[c.id] = Array.from(new Set(c.criteria.filter(() => rnd() < 0.5)));
      }
      const g = gradeSuite(suite.value, results);
      expect(g.ok).toBe(true);
      if (!g.ok) continue;
      expect(g.value.score).toBeGreaterThanOrEqual(0);
      expect(g.value.score).toBeLessThanOrEqual(1);
      // monotonicity: passing one more criterion never lowers the score
      const firstCase = suite.value.cases[0];
      const results2 = JSON.parse(JSON.stringify(results)) as Record<string, string[]>;
      if (!results2[firstCase.id].includes(firstCase.criteria[0])) {
        results2[firstCase.id].push(firstCase.criteria[0]);
      }
      const g2 = gradeSuite(suite.value, results2);
      expect(g2.ok).toBe(true);
      if (g2.ok) {
        expect(g2.value.score).toBeGreaterThanOrEqual(g.value.score - 1e-9);
      }
      // gate consistency: a pass implies every metric met its threshold
      const gate: RegressionGate = { thresholds: {} };
      for (const c of suite.value.cases) {
        const th: GateThreshold = { min: rnd() };
        gate.thresholds[c.id] = th;
      }
      const gv = applyRegressionGate(g.value.perCase, gate);
      if (!gv.ok) {
        expect(gv.reason.startsWith('gate-')).toBe(true);
        expect(gv.reason).toContain('gate-below-minimum');
      } else {
        for (const c of suite.value.cases) {
          const min = gate.thresholds[c.id].min as number;
          expect(g.value.perCase[c.id]).toBeGreaterThanOrEqual(min);
        }
      }
    }
  });
});
