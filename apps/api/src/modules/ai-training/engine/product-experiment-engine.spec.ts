// ============================================================================
// FILE: /apps/api/src/modules/ai-training/engine/product-experiment-engine.spec.ts
// ============================================================================
// Pinned spec for the AI-029..032 product experiment engine. Every refusal is
// named, every rate is rounded to 1e-6, and every aggregation is
// order-independent (all permutations) plus swept with 500 mulberry32(42)
// cases. Engine semantics were verified in a sandbox JS mirror before this
// spec was written; the pinned vectors here are the same ones.

import {
  AB_Z_CRITICAL,
  assignVariant,
  buildScorecards,
  buildTrend,
  defineExperiment,
  mineFailures,
  tallyExperiment,
} from './product-experiment-engine';

type V = { ok: boolean; reason?: string; value?: unknown };

const reasonOf = (v: V): string => {
  if (v.ok) throw new Error('expected a named refusal');
  return v.reason as string;
};
const valueOf = <T,>(v: V): T => {
  if (!v.ok) throw new Error(String(v.reason));
  return v.value as T;
};
const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;

const E50 = {
  id: 'exp-1',
  consentGranted: true,
  variants: [
    { id: 'control', splitPercent: 50 },
    { id: 'treat', splitPercent: 50 },
  ],
};

const mkOut = (vid: string, n: number, s: number) =>
  Array.from({ length: n }, (_, i) => ({ variantId: vid, userId: vid + '-u' + i, success: i < s }));

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function perm<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => perm([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}

describe('defineExperiment (AI-029) — the consent and split laws', () => {
  it('defines a valid experiment with a deep-copied variant list and default floor of 50', () => {
    const v = valueOf<{ id: string; minSamplesPerVariant: number; variants: unknown[] }>(defineExperiment(E50));
    expect(v.id).toBe('exp-1');
    expect(v.minSamplesPerVariant).toBe(50);
    expect(v.variants).toHaveLength(2);
    expect(v.variants).not.toBe(E50.variants);
  });

  it('refuses a non-consented experiment by name — the [C] law is hard', () => {
    expect(reasonOf(defineExperiment({ ...E50, consentGranted: false }))).toBe('experiment-no-consent');
    expect(reasonOf(defineExperiment({ ...E50, consentGranted: undefined as unknown as boolean }))).toBe('experiment-no-consent');
  });

  it('refuses structural violations by name', () => {
    expect(reasonOf(defineExperiment({ ...E50, id: '' }))).toBe('experiment-no-id');
    expect(reasonOf(defineExperiment({ ...E50, variants: [] }))).toBe('experiment-no-variants');
    expect(reasonOf(defineExperiment({ ...E50, variants: [{ id: 'a', splitPercent: 100 }] }))).toBe('experiment-single-variant');
    expect(reasonOf(defineExperiment({ ...E50, variants: [{ id: 'a', splitPercent: 50 }, { id: 'a', splitPercent: 50 }] }))).toBe('experiment-duplicate-variant:a');
    expect(reasonOf(defineExperiment({ ...E50, variants: [{ id: 'control', splitPercent: 0 }, { id: 'treat', splitPercent: 100 }] }))).toBe('experiment-invalid-split:control');
    expect(reasonOf(defineExperiment({ ...E50, variants: [{ id: 'a', splitPercent: 40 }, { id: 'b', splitPercent: 59 }] }))).toBe('experiment-invalid-split-total:99!=100');
    expect(reasonOf(defineExperiment({ ...E50, minSamplesPerVariant: 0 }))).toBe('experiment-invalid-min-samples');
  });

  it('accepts three-arm splits and preserves explicit floors', () => {
    const v = valueOf<{ minSamplesPerVariant: number; variants: unknown[] }>(
      defineExperiment({ id: 'e', consentGranted: true, minSamplesPerVariant: 7, variants: [{ id: 'a', splitPercent: 34 }, { id: 'b', splitPercent: 33 }, { id: 'c', splitPercent: 33 }] }),
    );
    expect(v.minSamplesPerVariant).toBe(7);
    expect(v.variants).toHaveLength(3);
  });
});

describe('assignVariant (AI-029) — deterministic bucketing and the consent gate', () => {
  it('refuses inactive experiments and declined consent by name', () => {
    expect(reasonOf(assignVariant({ experimentId: 'exp-1', userId: 'u', variants: E50.variants, active: false, consentGranted: true }))).toBe('assignment-experiment-inactive');
    expect(reasonOf(assignVariant({ experimentId: 'exp-1', userId: 'u', variants: E50.variants, active: true, consentGranted: false }))).toBe('assignment-consent-declined');
    expect(reasonOf(assignVariant({ experimentId: 'exp-1', userId: '', variants: E50.variants, active: true, consentGranted: true }))).toBe('assignment-no-user');
  });

  it('assigns the same variant to the same user on every call — 100 users, twice each', () => {
    for (let u = 0; u < 100; u++) {
      const id = 'user-' + u;
      const a1 = assignVariant({ experimentId: 'exp-1', userId: id, variants: E50.variants, active: true, consentGranted: true });
      const a2 = assignVariant({ experimentId: 'exp-1', userId: id, variants: E50.variants, active: true, consentGranted: true });
      expect(a1).toEqual(a2);
    }
  });

  it('lands every user exactly on the cumulative split boundary rule', () => {
    for (let u = 0; u < 100; u++) {
      const a = valueOf<{ variantId: string; bucket: number }>(
        assignVariant({ experimentId: 'exp-1', userId: 'user-' + u, variants: E50.variants, active: true, consentGranted: true }),
      );
      const expected = a.bucket < 50 ? 'control' : 'treat';
      expect(a.variantId).toBe(expected);
    }
  });
});

describe('tallyExperiment (AI-029) — honest verdicts and the samples floor', () => {
  it('reports insufficient-samples instead of guessing when an arm is under the floor', () => {
    const t = valueOf<{ verdict: string; winner: string | null }>(
      tallyExperiment({ variants: E50.variants, minSamplesPerVariant: 50, outcomes: [...mkOut('control', 30, 20), ...mkOut('treat', 30, 10)] }),
    );
    expect(t.verdict).toBe('insufficient-samples');
    expect(t.winner).toBeNull();
  });

  it('declares a winner only past the 95% critical value, with pinned z and lift', () => {
    const t = valueOf<{ verdict: string; winner: string; zScore: number; lift: number }>(
      tallyExperiment({ variants: E50.variants, minSamplesPerVariant: 50, outcomes: [...mkOut('control', 50, 35), ...mkOut('treat', 50, 20)] }),
    );
    const pool = 55 / 100;
    const se = Math.sqrt(pool * (1 - pool) * (1 / 50 + 1 / 50));
    expect(t.verdict).toBe('variant-wins');
    expect(t.winner).toBe('control');
    expect(t.zScore).toBe(r6(0.3 / se));
    expect(t.zScore).toBeGreaterThanOrEqual(AB_Z_CRITICAL);
    expect(t.lift).toBe(0.3);
  });

  it('reports inconclusive below the critical value — pinned z', () => {
    const t = valueOf<{ verdict: string; zScore: number }>(
      tallyExperiment({ variants: E50.variants, minSamplesPerVariant: 50, outcomes: [...mkOut('control', 50, 26), ...mkOut('treat', 50, 25)] }),
    );
    expect(t.verdict).toBe('inconclusive');
    expect(t.zScore).toBe(r6((0.52 - 0.5) / Math.sqrt(0.51 * 0.49 * 0.04)));
  });

  it('refuses double-tapped and unknown outcomes by name', () => {
    expect(reasonOf(tallyExperiment({ variants: E50.variants, minSamplesPerVariant: 1, outcomes: [{ variantId: 'control', userId: 'u1', success: true }, { variantId: 'treat', userId: 'u1', success: false }] }))).toBe('tally-duplicate-outcome:u1');
    expect(reasonOf(tallyExperiment({ variants: E50.variants, minSamplesPerVariant: 1, outcomes: [{ variantId: 'ghost', userId: 'u1', success: true }] }))).toBe('tally-unknown-variant:ghost');
  });

  it('an honest inconclusive on a perfect rate tie', () => {
    const t = valueOf<{ verdict: string; zScore: number }>(
      tallyExperiment({ variants: E50.variants, minSamplesPerVariant: 50, outcomes: [...mkOut('control', 50, 25), ...mkOut('treat', 50, 25)] }),
    );
    expect(t.verdict).toBe('inconclusive');
    expect(t.zScore).toBe(0);
  });
});

describe('buildScorecards (AI-030) — success, revert, approval rates', () => {
  const EV = [
    { agentId: 'coder', outcome: 'success' as const },
    { agentId: 'coder', outcome: 'success' as const },
    { agentId: 'coder', outcome: 'failure' as const, reverted: true },
    { agentId: 'coder', outcome: 'failure' as const, approved: false },
    { agentId: 'coder', outcome: 'success' as const, approved: true },
    { agentId: 'rookie', outcome: 'success' as const },
  ];

  it('computes rounded rates: 0.6 success, 0.2 revert, 0.5 approval', () => {
    const r = valueOf<{ agents: { agentId: string; successRate: number; revertRate: number; approvalRate: number; total: number }[]; insufficient: string[] }>(
      buildScorecards({ events: EV, minEventsPerAgent: 2 }),
    );
    const coder = r.agents.find((a) => a.agentId === 'coder') as Record<string, unknown>;
    expect(coder).toMatchObject({ total: 5, successRate: 0.6, revertRate: 0.2, approvalRate: 0.5 });
    expect(r.agents.map((a) => a.agentId)).toEqual(['coder', 'rookie']);
  });

  it('names agents below the events floor instead of hiding them', () => {
    const r = valueOf<{ insufficient: string[] }>(buildScorecards({ events: EV, minEventsPerAgent: 2 }));
    expect(r.insufficient).toEqual(['rookie']);
  });

  it('refuses malformed events by name', () => {
    expect(reasonOf(buildScorecards({ events: [{ agentId: 'x', outcome: 'boom' } as never], minEventsPerAgent: 1 }))).toBe('scorecard-event-invalid-outcome:boom');
    expect(reasonOf(buildScorecards({ events: [{ agentId: 'x', outcome: 'success', reverted: 'yes' } as never], minEventsPerAgent: 1 }))).toBe('scorecard-invalid-reverted:x');
  });
});

describe('buildTrend (AI-031) — deltas, degrade flags, and history integrity', () => {
  it('computes explicit deltas and flags against the threshold', () => {
    const t = valueOf<{ points: { delta: number | null; flag: string | null }[]; degradedBuckets: string[] }>(
      buildTrend({ degradeThreshold: 0.05, samples: [{ bucket: '2026-01-01', score: 0.8 }, { bucket: '2026-01-02', score: 0.78 }, { bucket: '2026-01-03', score: 0.9 }] }),
    );
    expect(t.points[0].delta).toBeNull();
    expect(t.points[1].delta).toBe(-0.02);
    expect(t.points[2].delta).toBe(0.12);
    expect(t.points[1].flag).toBe('flat');
    expect(t.points[2].flag).toBe('improving');
    expect(t.degradedBuckets).toEqual([]);
  });

  it('names degrading buckets — degradation is never averaged away', () => {
    const t = valueOf<{ points: { flag: string | null }[]; degradedBuckets: string[] }>(
      buildTrend({ degradeThreshold: 0.05, samples: [{ bucket: 'a', score: 0.9 }, { bucket: 'b', score: 0.8 }] }),
    );
    expect(t.points[1].flag).toBe('degrading');
    expect(t.degradedBuckets).toEqual(['b']);
  });

  it('refuses conflicting history but collapses identical double-taps', () => {
    expect(reasonOf(buildTrend({ degradeThreshold: 0.05, samples: [{ bucket: 'a', score: 0.9 }, { bucket: 'a', score: 0.8 }] }))).toBe('trend-conflicting-score:a');
    const t = valueOf<{ points: unknown[] }>(buildTrend({ degradeThreshold: 0.05, samples: [{ bucket: 'a', score: 0.9 }, { bucket: 'a', score: 0.9 }] }));
    expect(t.points).toHaveLength(1);
  });

  it('refuses out-of-range scores and empty buckets by name', () => {
    expect(reasonOf(buildTrend({ degradeThreshold: 0.05, samples: [{ bucket: 'a', score: 1.5 }] }))).toBe('trend-invalid-score:a');
    expect(reasonOf(buildTrend({ degradeThreshold: 0.05, samples: [{ bucket: '  ', score: 0.5 }] }))).toBe('trend-bucket-empty');
  });
});

describe('mineFailures (AI-032) — fingerprinted, ranked, capped mining', () => {
  it('refuses an all-passing batch by name — nothing to mine', () => {
    expect(reasonOf(mineFailures({ cases: [{ id: 'c1', content: 'X', passed: true }], maxMined: 5 }))).toBe('mining-no-failures');
  });

  it('refuses a batch over the cap loudly, never silently trimming', () => {
    const cases = ['x1', 'x2', 'x3', 'x4'].map((x, i) => ({ id: 'c' + (i + 1), content: x, passed: false }));
    expect(reasonOf(mineFailures({ cases, maxMined: 3 }))).toBe('mining-cap-exceeded:4>3');
  });

  it('ranks survivors by weight desc then id asc', () => {
    const m = valueOf<{ caseIds: string[] }>(
      mineFailures({ cases: [{ id: 'a', content: 'x', passed: false, weight: 1 }, { id: 'b', content: 'y', passed: false, weight: 3 }, { id: 'c', content: 'z', passed: false, weight: 2 }], maxMined: 5 }),
    );
    expect(m.caseIds).toEqual(['b', 'c', 'a']);
  });

  it('dedupes identical content id-asc and reports the drop count', () => {
    const m = valueOf<{ caseIds: string[]; duplicatesDropped: number }>(
      mineFailures({ cases: [{ id: 'c1', content: 'X', passed: false, weight: 9 }, { id: 'c2', content: 'X', passed: false, weight: 2 }], maxMined: 5 }),
    );
    expect(m.caseIds).toEqual(['c1']);
    expect(m.duplicatesDropped).toBe(1);
  });

  it('refuses malformed cases and caps by name', () => {
    expect(reasonOf(mineFailures({ cases: [{ id: 'c1', content: 'X', passed: 'yes' } as never], maxMined: 5 }))).toBe('mining-case-invalid-passed:c1');
    expect(reasonOf(mineFailures({ cases: [{ id: 'c1', content: 'X', passed: false, weight: 0 }], maxMined: 5 }))).toBe('mining-case-invalid-weight:c1');
    expect(reasonOf(mineFailures({ cases: [], maxMined: 5 }))).toBe('mining-no-cases');
    expect(reasonOf(mineFailures({ cases: [{ id: 'c1', content: 'X', passed: false }], maxMined: 0 }))).toBe('mining-invalid-cap');
  });
});

describe('order-independence — every serialization order yields the same verdict', () => {
  it('tallyExperiment: all permutations agree', () => {
    const outcomes = [...mkOut('control', 2, 2), ...mkOut('treat', 2, 0)];
    const perms = perm(outcomes);
    const base = JSON.stringify(tallyExperiment({ variants: E50.variants, minSamplesPerVariant: 1, outcomes: perms[0] }));
    for (const p of perms) {
      expect(JSON.stringify(tallyExperiment({ variants: E50.variants, minSamplesPerVariant: 1, outcomes: p }))).toBe(base);
    }
  });

  it('buildScorecards: all permutations agree', () => {
    const events = [
      { agentId: 'coder', outcome: 'success' as const },
      { agentId: 'coder', outcome: 'failure' as const, reverted: true },
      { agentId: 'rookie', outcome: 'success' as const },
      { agentId: 'rookie', outcome: 'failure' as const, approved: false },
    ];
    const perms = perm(events);
    const base = JSON.stringify(buildScorecards({ events: perms[0], minEventsPerAgent: 1 }));
    for (const p of perms) {
      expect(JSON.stringify(buildScorecards({ events: p, minEventsPerAgent: 1 }))).toBe(base);
    }
  });

  it('buildTrend: all permutations agree', () => {
    const samples = [{ bucket: 'a', score: 0.8 }, { bucket: 'b', score: 0.75 }, { bucket: 'c', score: 0.9 }];
    const perms = perm(samples);
    const base = JSON.stringify(buildTrend({ degradeThreshold: 0.05, samples: perms[0] }));
    for (const p of perms) {
      expect(JSON.stringify(buildTrend({ degradeThreshold: 0.05, samples: p }))).toBe(base);
    }
  });

  it('mineFailures: all permutations agree, duplicates included', () => {
    const cases = [
      { id: 'a', content: 'x', passed: false, weight: 1 },
      { id: 'b', content: 'y', passed: false, weight: 3 },
      { id: 'c', content: 'z', passed: false, weight: 2 },
      { id: 'd', content: 'y', passed: false, weight: 1 },
    ];
    const perms = perm(cases);
    const base = JSON.stringify(mineFailures({ cases: perms[0], maxMined: 5 }));
    for (const p of perms) {
      expect(JSON.stringify(mineFailures({ cases: p, maxMined: 5 }))).toBe(base);
    }
  });
});

describe('500-case mulberry32(42) sweep — invariants hold at scale', () => {
  it('sweeps experiments, assignments, tallies, trends and mining', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const nv = 2 + Math.floor(rnd() * 2);
      let rem = 100;
      const vars: { id: string; splitPercent: number }[] = [];
      for (let k = 0; k < nv - 1; k++) {
        const sp = 1 + Math.floor(rnd() * (rem - (nv - k - 1)));
        vars.push({ id: 'v' + k, splitPercent: sp });
        rem -= sp;
      }
      vars.push({ id: 'v' + (nv - 1), splitPercent: rem });
      const de = defineExperiment({ id: 'sweep-' + i, consentGranted: true, variants: vars });
      expect(de.ok).toBe(true);

      const uid = 'su' + i;
      const a1 = assignVariant({ experimentId: 'sweep-' + i, userId: uid, variants: vars, active: true, consentGranted: true });
      const a2 = assignVariant({ experimentId: 'sweep-' + i, userId: uid, variants: vars, active: true, consentGranted: true });
      expect(a1).toEqual(a2);
      expect(vars.map((v) => v.id)).toContain(valueOf<{ variantId: string }>(a1).variantId);

      const minS = 1 + Math.floor(rnd() * 5);
      const outs: { variantId: string; userId: string; success: boolean }[] = [];
      for (const v of vars) {
        const n = Math.floor(rnd() * (minS + 4));
        for (let k = 0; k < n; k++) {
          outs.push({ variantId: v.id, userId: v.id + '-' + k + '-' + i, success: rnd() < 0.5 });
        }
      }
      const tal = valueOf<{ variants: { successRate: number }[]; verdict: string; zScore: number | null }>(
        tallyExperiment({ variants: vars, minSamplesPerVariant: minS, outcomes: outs }),
      );
      for (const v of tal.variants) {
        expect(v.successRate).toBeGreaterThanOrEqual(0);
        expect(v.successRate).toBeLessThanOrEqual(1);
      }
      if (tal.verdict === 'variant-wins') {
        expect(tal.zScore as number).toBeGreaterThanOrEqual(AB_Z_CRITICAL);
      } else if (tal.verdict === 'inconclusive') {
        expect(tal.zScore as number).toBeLessThan(AB_Z_CRITICAL);
      }

      const nb = 1 + Math.floor(rnd() * 5);
      const samples: { bucket: string; score: number }[] = [];
      for (let k = 0; k < nb; k++) {
        samples.push({ bucket: 'b' + k, score: r6(rnd()) });
      }
      const t = valueOf<{ points: { score: number; delta: number | null; flag: string | null }[] }>(
        buildTrend({ degradeThreshold: 0.1, samples }),
      );
      for (const p of t.points) {
        expect(p.score).toBeGreaterThanOrEqual(0);
        expect(p.score).toBeLessThanOrEqual(1);
        if (p.delta !== null) {
          expect(p.flag === 'degrading').toBe(p.delta < -0.1);
        }
      }

      const nc = 1 + Math.floor(rnd() * 6);
      const cases: { id: string; content: string; passed: boolean; weight?: number }[] = [];
      for (let k = 0; k < nc; k++) {
        cases.push({ id: 'c' + k, content: 'content-' + Math.floor(rnd() * 4), passed: rnd() < 0.3, weight: 1 + Math.floor(rnd() * 3) });
      }
      const m = mineFailures({ cases, maxMined: 6 });
      if (m.ok) {
        const reversed = mineFailures({ cases: cases.slice().reverse(), maxMined: 6 });
        expect(JSON.stringify(valueOf(m))).toBe(JSON.stringify(valueOf(reversed)));
      } else {
        expect(reasonOf(m).startsWith('mining-no-failures') || reasonOf(m).startsWith('mining-cap-exceeded')).toBe(true);
      }
    }
  });
});
