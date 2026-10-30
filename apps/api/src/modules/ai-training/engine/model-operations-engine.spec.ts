// ============================================================================
// FILE: /apps/api/src/modules/ai-training/engine/model-operations-engine.spec.ts
// ============================================================================
// PINNED VECTORS + ORDER-INDEPENDENCE + SWEEPS for the model-operations engine
// (FORGE AI-040..AI-044). Every vector was hand-computed and sandbox-verified
// before this file was written. The 500-case mulberry32(42) sweeps assert the
// hard laws: cache hits are per-model and replayable, pinned entries are never
// evicted, chunk streams never accept gaps or invented suffixes, percentiles
// are monotonic with honest error rates, shadow verdicts never guess under
// the sample floor, and rollbacks only ever target previously-served versions.

import {
  lookupResponseCache,
  admitCacheEntry,
  applyStreamEvent,
  planStreamResume,
  aggregateServingMetrics,
  evaluateShadow,
  planRollback,
  Verdict,
  PREFIX_INPUT_COST_FACTOR,
  DEFAULT_MAX_CACHE_ENTRIES,
  STREAM_MAX_CHUNKS,
  MIN_SHADOW_SAMPLES,
  DEFAULT_AGREEMENT_THRESHOLD,
  DEFAULT_LATENCY_BUDGET_MS,
} from './model-operations-engine';

const reasonOf = (v: Verdict<unknown>): string => (v as { ok: false; reason: string }).reason;
const valueOf = <T>(v: Verdict<T>): T => (v as { ok: true; value: T }).value;
const ok = (v: Verdict<unknown>): boolean => (v as { ok: boolean }).ok === true;
const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;

/** mulberry32 — deterministic PRNG for the sweeps (pinned seed 42). */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** All orderings of n items — storage orders a caller can produce. */
function orderings<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const tail of orderings(rest)) out.push([items[i], ...tail]);
  }
  return out;
}

describe('model-operations engine pinned vectors (AI-040 cache lookup)', () => {
  const E1 = { id: 'rc_aaaaaaaa', modelId: 'm1', prompt: 'hello world', promptTokens: 2, outputTokens: 10, lastUsedAt: 1, createdAt: 1 };
  const E2 = { id: 'rc_bbbbbbbb', modelId: 'm1', prompt: 'You are a helpful assistant. Answer concisely.', promptTokens: 10, outputTokens: 50, lastUsedAt: 2, createdAt: 2 };
  const E3 = { id: 'rc_cccccccc', modelId: 'm1', prompt: 'You are a helpful assistant.', promptTokens: 6, outputTokens: 30, lastUsedAt: 3, createdAt: 3 };

  it('returns an exact hit with the full output-token saving, never re-billed', () => {
    const v = valueOf(lookupResponseCache({ modelId: 'm1', prompt: 'hello world', entries: [E1] }));
    expect(v.outcome).toBe('exact');
    expect(v.entryId).toBe('rc_aaaaaaaa');
    expect(v.reusedTokens).toBe(0);
    expect(v.savedTokens).toBe(10);
  });

  it('reuses a cached prompt prefix at the named discount factor', () => {
    expect(PREFIX_INPUT_COST_FACTOR).toBe(0.5);
    const v = valueOf(lookupResponseCache({
      modelId: 'm1',
      prompt: 'You are a helpful assistant. Answer concisely. What is 2+2?',
      entries: [E2],
    }));
    expect(v.outcome).toBe('prefix');
    expect(v.entryId).toBe('rc_bbbbbbbb');
    expect(v.reusedTokens).toBe(10);
    expect(v.savedTokens).toBe(5);
  });

  it('misses cleanly on an unseen prompt — never a guess', () => {
    const v = valueOf(lookupResponseCache({ modelId: 'm1', prompt: 'brand new prompt', entries: [E1, E2] }));
    expect(v.outcome).toBe('miss');
    expect(v.entryId).toBeNull();
    expect(v.savedTokens).toBe(0);
  });

  it('NEVER crosses models — the same prompt cached for m2 is a miss for m1', () => {
    const v = valueOf(lookupResponseCache({ modelId: 'm1', prompt: 'hello world', entries: [{ ...E1, modelId: 'm2' }] }));
    expect(v.outcome).toBe('miss');
  });

  it('picks the LONGEST cached prefix when several match', () => {
    const v = valueOf(lookupResponseCache({
      modelId: 'm1',
      prompt: 'You are a helpful assistant. Answer concisely. Now.',
      entries: [E2, E3],
    }));
    expect(v.outcome).toBe('prefix');
    expect(v.entryId).toBe('rc_bbbbbbbb');
    expect(v.reusedTokens).toBe(10);
  });

  it('breaks exact-duplicate ties by lowest id — never by storage order', () => {
    const v = valueOf(lookupResponseCache({
      modelId: 'm1', prompt: 'dup',
      entries: [
        { id: 'zz', modelId: 'm1', prompt: 'dup', promptTokens: 1, outputTokens: 5, lastUsedAt: 1, createdAt: 1 },
        { id: 'aa', modelId: 'm1', prompt: 'dup', promptTokens: 1, outputTokens: 7, lastUsedAt: 2, createdAt: 2 },
      ],
    }));
    expect(v.outcome).toBe('exact');
    expect(v.entryId).toBe('aa');
    expect(v.savedTokens).toBe(7);
  });

  it('names malformed lookups', () => {
    expect(reasonOf(lookupResponseCache({ modelId: '', prompt: 'x', entries: [] }))).toBe('cache-lookup-no-model');
    expect(reasonOf(lookupResponseCache({ modelId: 'm1', prompt: '', entries: [] }))).toBe('cache-lookup-no-prompt');
  });
});

describe('model-operations engine pinned vectors (AI-040 cache admission)', () => {
  const ea = { id: 'e1', modelId: 'm1', prompt: 'p1', promptTokens: 1, outputTokens: 1, lastUsedAt: 10, createdAt: 1, pinned: false };
  const eb = { id: 'e2', modelId: 'm1', prompt: 'p2', promptTokens: 1, outputTokens: 1, lastUsedAt: 20, createdAt: 2, pinned: false };

  it('admits a fresh entry with a deterministic content fingerprint', () => {
    const v = valueOf(admitCacheEntry({ modelId: 'm1', prompt: 'hello', promptTokens: 2, outputTokens: 10, now: 100, entries: [] }));
    expect(v.admitted.id).toBe('rc_5e7ef3b1');
    expect(v.admitted.lastUsedAt).toBe(100);
    expect(v.evicted).toEqual([]);
    expect(v.duplicate).toBe(false);
  });

  it('is idempotent on a double-tap admit — the same fingerprint, nothing evicted', () => {
    const first = valueOf(admitCacheEntry({ modelId: 'm1', prompt: 'hello', promptTokens: 2, outputTokens: 10, now: 100, entries: [] }));
    const v = valueOf(admitCacheEntry({ modelId: 'm1', prompt: 'hello', promptTokens: 2, outputTokens: 10, now: 200, entries: [first.admitted] }));
    expect(v.admitted.id).toBe('rc_5e7ef3b1');
    expect(v.evicted).toEqual([]);
    expect(v.duplicate).toBe(true);
    expect(v.admitted.lastUsedAt).toBe(200);
  });

  it('evicts the least-recently-used entry when the pool is at capacity', () => {
    const v = valueOf(admitCacheEntry({ modelId: 'm1', prompt: 'p3', promptTokens: 1, outputTokens: 1, now: 30, maxEntries: 2, entries: [ea, eb] }));
    expect(v.evicted).toEqual(['e1']);
    expect(v.duplicate).toBe(false);
  });

  it('NEVER evicts pinned entries — evicts the next LRU instead', () => {
    const v = valueOf(admitCacheEntry({ modelId: 'm1', prompt: 'p3', promptTokens: 1, outputTokens: 1, now: 30, maxEntries: 2, entries: [{ ...ea, pinned: true }, eb] }));
    expect(v.evicted).toEqual(['e2']);
  });

  it('refuses a full all-pinned pool by name — never a silent drop', () => {
    const v = admitCacheEntry({ modelId: 'm1', prompt: 'p3', promptTokens: 1, outputTokens: 1, now: 30, maxEntries: 2, entries: [{ ...ea, pinned: true }, { ...eb, pinned: true }] });
    expect(reasonOf(v)).toBe('cache-full-pinned:2');
  });

  it('names malformed admissions', () => {
    expect(reasonOf(admitCacheEntry({ modelId: 'm1', prompt: 'p', promptTokens: 1, outputTokens: 1, maxEntries: 0, entries: [] }))).toBe('cache-admit-invalid-max:0');
    expect(reasonOf(admitCacheEntry({ modelId: 'm1', prompt: '', promptTokens: 1, outputTokens: 1, entries: [] }))).toBe('cache-admit-no-prompt');
    expect(reasonOf(admitCacheEntry({ modelId: 'm1', prompt: 'p', promptTokens: 0, outputTokens: 1, entries: [] }))).toBe('cache-admit-invalid-tokens:0');
    expect(reasonOf(admitCacheEntry({ modelId: 'm1', prompt: 'p', promptTokens: 1, outputTokens: 0, entries: [] }))).toBe('cache-admit-invalid-output:0');
  });

  it('exposes the default capacity as a named constant, not a magic number', () => {
    expect(DEFAULT_MAX_CACHE_ENTRIES).toBe(128);
  });
});

describe('model-operations engine pinned vectors (AI-041 streaming)', () => {
  it('appends chunks contiguously and refuses a gap by name', () => {
    const st1 = valueOf(applyStreamEvent({ streamId: 's1', status: 'open', chunks: [] }, { type: 'chunk', index: 0, content: 'Hel' }));
    expect(st1.chunks).toEqual(['Hel']);
    expect(st1.status).toBe('open');
    const bad = applyStreamEvent(st1, { type: 'chunk', index: 2, content: 'x' });
    expect(reasonOf(bad)).toBe('stream-chunk-out-of-order:2>1');
  });

  it('cancels idempotently — a second cancel changes nothing', () => {
    const st2 = valueOf(applyStreamEvent(
      valueOf(applyStreamEvent({ streamId: 's1', status: 'open', chunks: [] }, { type: 'chunk', index: 0, content: 'Hel' })),
      { type: 'chunk', index: 1, content: 'lo' },
    ));
    const c1 = valueOf(applyStreamEvent(st2, { type: 'cancel' }));
    expect(c1.status).toBe('cancelled');
    const c2 = valueOf(applyStreamEvent(c1, { type: 'cancel' }));
    expect(c2).toEqual(c1);
  });

  it('refuses cancel after completion and complete after cancel, by name', () => {
    const st2 = valueOf(applyStreamEvent(
      valueOf(applyStreamEvent({ streamId: 's1', status: 'open', chunks: [] }, { type: 'chunk', index: 0, content: 'Hel' })),
      { type: 'chunk', index: 1, content: 'lo' },
    ));
    const done = valueOf(applyStreamEvent(st2, { type: 'complete' }));
    expect(done.status).toBe('completed');
    expect(reasonOf(applyStreamEvent(done, { type: 'cancel' }))).toBe('stream-cancel-after-completion');
    expect(reasonOf(applyStreamEvent(done, { type: 'chunk', index: 2, content: 'x' }))).toBe('stream-not-open:completed');
    const cancelled = valueOf(applyStreamEvent(st2, { type: 'cancel' }));
    expect(reasonOf(applyStreamEvent(cancelled, { type: 'complete' }))).toBe('stream-complete-after-cancel');
  });

  it('resumes with the exact unseen suffix — the client can never pull ahead', () => {
    const st3 = valueOf(applyStreamEvent(
      valueOf(applyStreamEvent(
        valueOf(applyStreamEvent({ streamId: 's1', status: 'open', chunks: [] }, { type: 'chunk', index: 0, content: 'Hel' })),
        { type: 'chunk', index: 1, content: 'lo' },
      )),
      { type: 'chunk', index: 2, content: '!' },
    ));
    const v = valueOf(planStreamResume(st3, 1));
    expect(v.resumeFromIndex).toBe(2);
    expect(v.replayChunks).toEqual(['!']);
    expect(reasonOf(planStreamResume(st3, 5))).toBe('resume-ahead-of-stream:5>2');
    expect(reasonOf(planStreamResume(st3, -2))).toBe('resume-invalid-index:-2');
  });

  it('refuses resume on cancelled and completed streams, naming the status', () => {
    const st2 = valueOf(applyStreamEvent({ streamId: 's1', status: 'open', chunks: [] }, { type: 'chunk', index: 0, content: 'Hel' }));
    const cancelled = valueOf(applyStreamEvent(st2, { type: 'cancel' }));
    expect(reasonOf(planStreamResume(cancelled, 1))).toBe('stream-not-resumable:cancelled');
    const done = valueOf(applyStreamEvent(st2, { type: 'complete' }));
    expect(reasonOf(planStreamResume(done, 1))).toBe('stream-not-resumable:completed');
  });

  it('enforces the chunk cap by name — a stream is never unbounded', () => {
    expect(STREAM_MAX_CHUNKS).toBe(4096);
    const big = { streamId: 'sbig', status: 'open' as const, chunks: new Array(4096).fill('x') };
    expect(reasonOf(applyStreamEvent(big, { type: 'chunk', index: 4096, content: 'y' }))).toBe('stream-chunk-cap:4096>=4096');
  });
});

describe('model-operations engine pinned vectors (AI-042 monitoring)', () => {
  const mk = (latencyMs: number, tokens: number, costUsd: number, ok: boolean, ttftMs: number) => ({ latencyMs, tokens, costUsd, ok, ttftMs });
  const samples = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((l, i) => mk(l, 10, 0.001 * (i + 1), i !== 3, Math.round(l / 10)));

  it('computes honest nearest-rank percentiles over SUCCESSFUL requests only', () => {
    const v = valueOf(aggregateServingMetrics({ modelId: 'm1', samples }));
    expect(v.sampleCount).toBe(10);
    expect(v.errorCount).toBe(1);
    expect(v.errorRate).toBe(0.1);
    expect(v.p50LatencyMs).toBe(600);
    expect(v.p95LatencyMs).toBe(1000);
    expect(v.p99LatencyMs).toBe(1000);
    expect(v.avgTtftMs).toBe(56.666667);
    expect(v.totalTokens).toBe(100);
    expect(v.totalCostUsd).toBe(0.055);
    expect(v.costPer1kTokens).toBe(0.55);
    expect(v.latencyBudgetMs).toBe(DEFAULT_LATENCY_BUDGET_MS);
    expect(v.budgetBreached).toBe(false);
  });

  it('FLAGS a p95 latency-budget breach — degradation is never silent', () => {
    const v = valueOf(aggregateServingMetrics({ modelId: 'm1', samples, latencyBudgetMs: 900 }));
    expect(v.budgetBreached).toBe(true);
  });

  it('refuses empty and malformed sample sets by name', () => {
    expect(reasonOf(aggregateServingMetrics({ modelId: 'm1', samples: [] }))).toBe('metrics-no-samples');
    expect(reasonOf(aggregateServingMetrics({ modelId: 'm1', samples: [mk(0, 10, 0.1, true, 1)] }))).toBe('metrics-invalid-sample:0');
    expect(reasonOf(aggregateServingMetrics({ modelId: '', samples }))).toBe('metrics-no-model');
  });
});

describe('model-operations engine pinned vectors (AI-043 shadow)', () => {
  const pairs30 = (agree: number) => new Array(30).fill(0).map((_, i) => ({ agree: i < agree }));

  it('recommends promotion when agreement clears the named threshold', () => {
    expect(DEFAULT_AGREEMENT_THRESHOLD).toBe(0.95);
    expect(MIN_SHADOW_SAMPLES).toBe(30);
    const v = valueOf(evaluateShadow({ championId: 'm1', challengerId: 'm2', pairs: pairs30(29) }));
    expect(v.sampleCount).toBe(30);
    expect(v.agreementCount).toBe(29);
    expect(v.agreementRate).toBe(0.966667);
    expect(v.verdict).toBe('promote-shadow');
  });

  it('holds the shadow when agreement falls short', () => {
    const v = valueOf(evaluateShadow({ championId: 'm1', challengerId: 'm2', pairs: pairs30(20) }));
    expect(v.agreementRate).toBe(0.666667);
    expect(v.verdict).toBe('hold-shadow');
    const v28 = valueOf(evaluateShadow({ championId: 'm1', challengerId: 'm2', pairs: pairs30(28) }));
    expect(v28.agreementRate).toBe(0.933333);
    expect(v28.verdict).toBe('hold-shadow');
  });

  it('refuses a verdict under the sample floor — this engine does not guess', () => {
    const v = evaluateShadow({ championId: 'm1', challengerId: 'm2', pairs: pairs30(28).slice(0, 29) });
    expect(reasonOf(v)).toBe('shadow-insufficient-samples:29<30');
  });

  it('names malformed shadow deployments', () => {
    expect(reasonOf(evaluateShadow({ championId: '', challengerId: 'm2', pairs: pairs30(30) }))).toBe('shadow-no-champion');
    expect(reasonOf(evaluateShadow({ championId: 'm1', challengerId: 'm1', pairs: pairs30(30) }))).toBe('shadow-same-model:m1');
  });
});

describe('model-operations engine pinned vectors (AI-044 rollback)', () => {
  it('flips instantly to a previously-served version with a replayable fingerprint', () => {
    const v = valueOf(planRollback({ modelId: 'm1', currentVersion: 'v3', targetVersion: 'v2', servedVersions: ['v1', 'v2', 'v3'] }));
    expect(v.fromVersion).toBe('v3');
    expect(v.toVersion).toBe('v2');
    expect(v.instant).toBe(true);
    expect(v.fingerprint).toBe('rb_5f600c28');
    expect(v.servedVersionsAfter).toEqual(['v1', 'v2', 'v3']);
  });

  it('refuses no-ops, unknown targets and unserved currents, by name', () => {
    expect(reasonOf(planRollback({ modelId: 'm1', currentVersion: 'v3', targetVersion: 'v3', servedVersions: ['v1', 'v3'] }))).toBe('rollback-same-version:v3');
    expect(reasonOf(planRollback({ modelId: 'm1', currentVersion: 'v3', targetVersion: 'v9', servedVersions: ['v1', 'v3'] }))).toBe('rollback-unknown-version:v9');
    expect(reasonOf(planRollback({ modelId: 'm1', currentVersion: 'vX', targetVersion: 'v1', servedVersions: ['v1', 'v3'] }))).toBe('rollback-current-not-served:vX');
    expect(reasonOf(planRollback({ modelId: '', currentVersion: 'v3', targetVersion: 'v2', servedVersions: ['v2', 'v3'] }))).toBe('rollback-no-model');
    expect(reasonOf(planRollback({ modelId: 'm1', currentVersion: 'v3', targetVersion: '', servedVersions: ['v2', 'v3'] }))).toBe('rollback-no-target');
  });
});

describe('model-operations engine order-independence', () => {
  const ENTRIES = [
    { id: 'rc_aaaaaaaa', modelId: 'm1', prompt: 'hello world', promptTokens: 2, outputTokens: 10, lastUsedAt: 1, createdAt: 1 },
    { id: 'rc_bbbbbbbb', modelId: 'm1', prompt: 'hello', promptTokens: 1, outputTokens: 5, lastUsedAt: 2, createdAt: 2 },
  ];

  it('cache lookups never depend on entry storage order', () => {
    for (const perm of orderings(ENTRIES)) {
      const v = valueOf(lookupResponseCache({ modelId: 'm1', prompt: 'hello world', entries: perm }));
      expect(v.outcome).toBe('exact');
      expect(v.entryId).toBe('rc_aaaaaaaa');
      expect(v.savedTokens).toBe(10);
      const p = valueOf(lookupResponseCache({ modelId: 'm1', prompt: 'hello there', entries: perm }));
      expect(p.outcome).toBe('prefix');
      expect(p.entryId).toBe('rc_bbbbbbbb');
    }
  });
});

describe('model-operations engine 500-case mulberry32(42) sweeps', () => {
  it('cache: hits replay, stay per-model, pinned never evicted, LRU honest, caps hold', () => {
    const rnd = mulberry32(42);
    const randPrompt = (): string => {
      const n = 1 + Math.floor(rnd() * 8);
      let s = '';
      for (let i = 0; i < n; i++) s += 'abc'[Math.floor(rnd() * 3)];
      return s;
    };
    for (let i = 0; i < 500; i++) {
      const entryCount = Math.floor(rnd() * 4);
      const entries: {
        id: string; modelId: string; prompt: string; promptTokens: number;
        outputTokens: number; lastUsedAt: number; createdAt: number; pinned: boolean;
      }[] = [];
      for (let j = 0; j < entryCount; j++) {
        entries.push({
          id: 'e' + j,
          modelId: rnd() < 0.5 ? 'm1' : 'm2',
          prompt: randPrompt(),
          promptTokens: 1 + Math.floor(rnd() * 20),
          outputTokens: 1 + Math.floor(rnd() * 50),
          lastUsedAt: Math.floor(rnd() * 1000),
          createdAt: Math.floor(rnd() * 1000),
          pinned: rnd() < 0.3,
        });
      }
      const prompt = randPrompt();
      const v = lookupResponseCache({ modelId: 'm1', prompt, entries });
      expect(ok(v)).toBe(true);
      const p = valueOf(v);
      expect(['exact', 'prefix', 'miss']).toContain(p.outcome);
      expect(p.savedTokens).toBeGreaterThanOrEqual(0);
      expect(p.reusedTokens).toBeGreaterThanOrEqual(0);
      if (p.outcome !== 'miss') {
        const hit = entries.find((x) => x.id === p.entryId);
        if (!hit) throw new Error('sweep: hit entry missing');
        expect(hit.modelId).toBe('m1');
      }
      if (p.outcome === 'exact') {
        const hit = entries.find((x) => x.id === p.entryId);
        if (!hit) throw new Error('sweep: exact hit missing');
        expect(hit.prompt).toBe(prompt);
        expect(p.savedTokens).toBe(hit.outputTokens);
      }
      if (p.outcome === 'prefix') {
        const hit = entries.find((x) => x.id === p.entryId);
        if (!hit) throw new Error('sweep: prefix hit missing');
        expect(prompt.startsWith(hit.prompt)).toBe(true);
        expect(p.reusedTokens).toBe(hit.promptTokens);
        expect(p.savedTokens).toBe(r6(hit.promptTokens * (1 - PREFIX_INPUT_COST_FACTOR)));
        for (const e of entries) {
          if (e.modelId === 'm1' && prompt.startsWith(e.prompt) && e.prompt.length > hit.prompt.length) {
            throw new Error('sweep: a longer cached prefix was skipped');
          }
        }
      }
      const again = lookupResponseCache({ modelId: 'm1', prompt, entries });
      expect(JSON.stringify(again)).toBe(JSON.stringify(v));
      for (const perm of orderings(entries)) {
        const pv = lookupResponseCache({ modelId: 'm1', prompt, entries: perm });
        expect(JSON.stringify(pv)).toBe(JSON.stringify(v));
      }
      const max = 1 + Math.floor(rnd() * 4);
      const av = admitCacheEntry({
        modelId: 'm1', prompt, promptTokens: 1 + Math.floor(rnd() * 10),
        outputTokens: 1 + Math.floor(rnd() * 10), now: Math.floor(rnd() * 10000),
        maxEntries: max, pinned: rnd() < 0.3, entries,
      });
      if (!ok(av)) {
        expect(reasonOf(av)).toMatch(/^cache-full-pinned:/);
        continue;
      }
      const a = valueOf(av);
      if (!a.duplicate) {
        const mine = entries.filter((x) => x.modelId === 'm1');
        const keptPinned = mine.filter((x) => x.pinned).map((x) => x.id);
        for (const id of a.evicted) expect(keptPinned).not.toContain(id);
        const keptCount = mine.length - a.evicted.length + 1;
        expect(keptCount).toBeLessThanOrEqual(max);
        for (const id of a.evicted) {
          const ev = mine.find((x) => x.id === id);
          if (!ev) throw new Error('sweep: evicted entry missing');
          const survivors = mine.filter((x) => !a.evicted.includes(x.id) && !x.pinned && x.id !== a.admitted.id);
          for (const s of survivors) expect(ev.lastUsedAt).toBeLessThanOrEqual(s.lastUsedAt);
        }
      }
    }
  });

  it('stream: chunks stay contiguous, resumes replay the exact suffix, cancel is idempotent', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const n = Math.floor(rnd() * 20);
      let st = { streamId: 's', status: 'open' as const, chunks: [] as string[] };
      for (let c = 0; c < n; c++) {
        const ev = applyStreamEvent(st, { type: 'chunk', index: c, content: 'x' + c });
        expect(ok(ev)).toBe(true);
        st = valueOf(ev);
      }
      expect(st.chunks.length).toBe(n);
      const bad = applyStreamEvent(st, { type: 'chunk', index: n + 1 + Math.floor(rnd() * 3), content: 'y' });
      expect(ok(bad)).toBe(false);
      expect(reasonOf(bad)).toMatch(/^stream-chunk-out-of-order:/);
      const rIdx = Math.floor(rnd() * (n + 1)) - 1;
      const rv = planStreamResume(st, rIdx);
      expect(ok(rv)).toBe(true);
      const r = valueOf(rv);
      expect(r.resumeFromIndex).toBe(rIdx + 1);
      expect(r.replayChunks).toEqual(st.chunks.slice(rIdx + 1));
      expect(ok(planStreamResume(st, st.chunks.length + 5))).toBe(false);
      const c1v = applyStreamEvent(st, { type: 'cancel' });
      expect(ok(c1v)).toBe(true);
      expect(valueOf(c1v).status).toBe('cancelled');
      const c2v = applyStreamEvent(valueOf(c1v), { type: 'cancel' });
      expect(JSON.stringify(valueOf(c2v))).toBe(JSON.stringify(valueOf(c1v)));
      expect(ok(applyStreamEvent(valueOf(c1v), { type: 'complete' }))).toBe(false);
      const again = planStreamResume(st, rIdx);
      expect(JSON.stringify(again)).toBe(JSON.stringify(rv));
    }
  });

  it('metrics: percentiles monotonic, error rate honest, budget flag exact, replayable', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(rnd() * 30);
      const samples = new Array(n).fill(0).map(() => ({
        latencyMs: 1 + Math.floor(rnd() * 5000),
        tokens: 1 + Math.floor(rnd() * 1000),
        costUsd: rnd() * 0.5,
        ok: rnd() >= 0.15,
        ttftMs: rnd() * 500,
      }));
      const budget = Math.floor(rnd() * 4000);
      const v = aggregateServingMetrics({ modelId: 'm', samples, latencyBudgetMs: budget });
      expect(ok(v)).toBe(true);
      const p = valueOf(v);
      expect(p.p50LatencyMs).toBeLessThanOrEqual(p.p95LatencyMs);
      expect(p.p95LatencyMs).toBeLessThanOrEqual(p.p99LatencyMs);
      expect(p.errorRate).toBeGreaterThanOrEqual(0);
      expect(p.errorRate).toBeLessThanOrEqual(1);
      expect(p.errorCount + samples.filter((s) => s.ok !== false).length).toBe(samples.length);
      expect(p.budgetBreached).toBe(p.p95LatencyMs > budget);
      expect(p.totalTokens).toBe(samples.reduce((acc, s) => acc + s.tokens, 0));
      const again = aggregateServingMetrics({ modelId: 'm', samples, latencyBudgetMs: budget });
      expect(JSON.stringify(again)).toBe(JSON.stringify(v));
    }
  });

  it('shadow + rollback: verdicts match counts, floors hold, only served versions accepted', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const n = Math.floor(rnd() * 60);
      const pairs = new Array(n).fill(0).map(() => ({ agree: rnd() < 0.9 }));
      const v = evaluateShadow({ championId: 'm1', challengerId: 'm2', pairs });
      if (!ok(v)) {
        expect(reasonOf(v)).toMatch(/^shadow-insufficient-samples:/);
      } else {
        const p = valueOf(v);
        const agree = pairs.filter((x) => x.agree === true).length;
        expect(p.agreementRate).toBe(r6(agree / n));
        expect(p.verdict).toBe(p.agreementRate >= p.threshold ? 'promote-shadow' : 'hold-shadow');
      }
      const servedCount = 1 + Math.floor(rnd() * 5);
      const served = new Array(servedCount).fill(0).map((_, k) => 'v' + k);
      const from = served[Math.floor(rnd() * servedCount)];
      const target = rnd() < 0.7 ? served[Math.floor(rnd() * servedCount)] : 'vX' + i;
      const rb = planRollback({ modelId: 'm', currentVersion: from, targetVersion: target, servedVersions: served });
      if (ok(rb)) {
        expect(target === from).toBe(false);
        expect(served).toContain(target);
        expect(valueOf(rb).instant).toBe(true);
      } else if (target === from) {
        expect(reasonOf(rb)).toMatch(/^rollback-same-version:/);
      } else if (!served.includes(target)) {
        expect(reasonOf(rb)).toMatch(/^rollback-unknown-version:/);
      } else {
        throw new Error('sweep: unexpected rollback refusal ' + reasonOf(rb));
      }
    }
  });
});
